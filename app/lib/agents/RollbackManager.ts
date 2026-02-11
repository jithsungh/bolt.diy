/**
 * RollbackManager — Phase 3
 *
 * Creates file-level checkpoints before agent changes and provides
 * reliable rollback when execution feedback detects critical failures.
 *
 * Integration:
 *  - Used by ExecutionFeedbackLoop before applying any file changes
 *  - Reads / writes through WebContainer FS (browser-safe)
 *  - Checkpoint data is kept in memory (no Node.js persistence needed)
 */

import { createScopedLogger } from '~/utils/logger';
import type { FileChange } from './types';

const logger = createScopedLogger('RollbackManager');

// Re-use the lightweight WebContainer type alias from Phase 2
type WebContainer = any;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface Checkpoint {
  id: string;
  createdAt: number;
  files: CheckpointFile[];
  metadata?: Record<string, unknown>;
}

export interface CheckpointFile {
  filePath: string;
  /** null means the file did not exist before the change */
  originalContent: string | null;
  /** The change that will be applied *after* the checkpoint is taken */
  changeType: 'create' | 'modify' | 'delete';
}

export interface RollbackResult {
  success: boolean;
  filesRestored: number;
  filesDeleted: number;
  errors: string[];
  duration: number;
}

export interface RollbackManagerConfig {
  /** Maximum number of checkpoints to keep in memory (FIFO) */
  maxCheckpoints?: number;
  /** Verify file contents after rollback */
  verifyAfterRollback?: boolean;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class RollbackManager {
  private checkpoints: Map<string, Checkpoint> = new Map();
  private checkpointOrder: string[] = [];
  private maxCheckpoints: number;
  private verifyAfterRollback: boolean;

  constructor(config: RollbackManagerConfig = {}) {
    this.maxCheckpoints = config.maxCheckpoints ?? 20;
    this.verifyAfterRollback = config.verifyAfterRollback ?? true;
    logger.info('RollbackManager initialized', { maxCheckpoints: this.maxCheckpoints });
  }

  // -------------------------------------------------------------------------
  // Create checkpoint
  // -------------------------------------------------------------------------

  /**
   * Snapshot every file that `changes` will touch.
   * Must be called **before** changes are written to WebContainer.
   */
  async createCheckpoint(
    changes: FileChange[],
    webcontainer: WebContainer,
    workDir: string,
    meta?: Record<string, unknown>,
  ): Promise<Checkpoint> {
    const id = `ckpt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const files: CheckpointFile[] = [];

    for (const change of changes) {
      const fullPath = `${workDir}/${change.filePath}`;
      let originalContent: string | null = null;

      if (change.changeType === 'create') {
        // File should not exist yet – but guard against existing files
        originalContent = await this.safeReadFile(webcontainer, fullPath);
      } else if (change.changeType === 'modify') {
        originalContent = await this.safeReadFile(webcontainer, fullPath);
      } else if (change.changeType === 'delete') {
        originalContent = await this.safeReadFile(webcontainer, fullPath);
      }

      files.push({
        filePath: change.filePath,
        originalContent,
        changeType: change.changeType,
      });
    }

    const checkpoint: Checkpoint = {
      id,
      createdAt: Date.now(),
      files,
      metadata: meta,
    };

    // Store & enforce limit
    this.checkpoints.set(id, checkpoint);
    this.checkpointOrder.push(id);

    while (this.checkpointOrder.length > this.maxCheckpoints) {
      const oldest = this.checkpointOrder.shift()!;
      this.checkpoints.delete(oldest);
    }

    logger.info(`Checkpoint created: ${id}`, {
      files: files.length,
      total: this.checkpoints.size,
    });

    return checkpoint;
  }

  // -------------------------------------------------------------------------
  // Rollback
  // -------------------------------------------------------------------------

  /**
   * Restore every file recorded in `checkpoint` to its original state.
   */
  async rollback(
    checkpoint: Checkpoint,
    webcontainer: WebContainer,
    workDir: string,
  ): Promise<RollbackResult> {
    const start = Date.now();
    const errors: string[] = [];
    let filesRestored = 0;
    let filesDeleted = 0;

    logger.info(`Rolling back checkpoint ${checkpoint.id} (${checkpoint.files.length} files)`);

    for (const file of checkpoint.files) {
      const fullPath = `${workDir}/${file.filePath}`;

      try {
        switch (file.changeType) {
          case 'create':
            // The file was *created* by the change — reverse = delete it
            if (file.originalContent === null) {
              await this.safeDeleteFile(webcontainer, fullPath);
              filesDeleted++;
            } else {
              // File already existed before; restore original
              await webcontainer.fs.writeFile(fullPath, file.originalContent);
              filesRestored++;
            }
            break;

          case 'modify':
            if (file.originalContent !== null) {
              await webcontainer.fs.writeFile(fullPath, file.originalContent);
              filesRestored++;
            }
            break;

          case 'delete':
            // The file was *deleted* by the change — reverse = recreate it
            if (file.originalContent !== null) {
              await this.ensureDir(webcontainer, fullPath);
              await webcontainer.fs.writeFile(fullPath, file.originalContent);
              filesRestored++;
            }
            break;
        }
      } catch (err) {
        const msg = `Failed to rollback ${file.filePath}: ${err instanceof Error ? err.message : String(err)}`;
        logger.error(msg);
        errors.push(msg);
      }
    }

    // Optional post-rollback verification
    if (this.verifyAfterRollback && errors.length === 0) {
      const verification = await this.verifyRollback(checkpoint, webcontainer, workDir);

      if (!verification.success) {
        errors.push(...verification.errors);
      }
    }

    const result: RollbackResult = {
      success: errors.length === 0,
      filesRestored,
      filesDeleted,
      errors,
      duration: Date.now() - start,
    };

    logger.info(`Rollback ${result.success ? 'succeeded' : 'failed'}`, result);

    return result;
  }

  // -------------------------------------------------------------------------
  // Verification
  // -------------------------------------------------------------------------

  /**
   * Verify that all files match their checkpoint state.
   */
  async verifyRollback(
    checkpoint: Checkpoint,
    webcontainer: WebContainer,
    workDir: string,
  ): Promise<{ success: boolean; errors: string[] }> {
    const errors: string[] = [];

    for (const file of checkpoint.files) {
      const fullPath = `${workDir}/${file.filePath}`;
      const current = await this.safeReadFile(webcontainer, fullPath);

      switch (file.changeType) {
        case 'create':
          if (file.originalContent === null && current !== null) {
            errors.push(`${file.filePath}: file should have been deleted but still exists`);
          } else if (file.originalContent !== null && current !== file.originalContent) {
            errors.push(`${file.filePath}: content mismatch after rollback`);
          }
          break;

        case 'modify':
          if (current !== file.originalContent) {
            errors.push(`${file.filePath}: content mismatch after rollback`);
          }
          break;

        case 'delete':
          if (file.originalContent !== null && current === null) {
            errors.push(`${file.filePath}: file should have been restored but is missing`);
          }
          break;
      }
    }

    return { success: errors.length === 0, errors };
  }

  // -------------------------------------------------------------------------
  // Checkpoint management
  // -------------------------------------------------------------------------

  getCheckpoint(id: string): Checkpoint | undefined {
    return this.checkpoints.get(id);
  }

  getLatestCheckpoint(): Checkpoint | undefined {
    const lastId = this.checkpointOrder[this.checkpointOrder.length - 1];
    return lastId ? this.checkpoints.get(lastId) : undefined;
  }

  listCheckpoints(): Checkpoint[] {
    return this.checkpointOrder
      .map(id => this.checkpoints.get(id)!)
      .filter(Boolean);
  }

  clearCheckpoints(): void {
    this.checkpoints.clear();
    this.checkpointOrder = [];
    logger.info('All checkpoints cleared');
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private async safeReadFile(wc: WebContainer, path: string): Promise<string | null> {
    try {
      return await wc.fs.readFile(path, 'utf-8');
    } catch {
      return null; // file does not exist
    }
  }

  private async safeDeleteFile(wc: WebContainer, path: string): Promise<void> {
    try {
      await wc.fs.rm(path);
    } catch {
      // already gone – that's fine
    }
  }

  private async ensureDir(wc: WebContainer, filePath: string): Promise<void> {
    const parts = filePath.split('/');
    parts.pop(); // remove file name
    const dir = parts.join('/');

    if (dir) {
      try {
        await wc.fs.mkdir(dir, { recursive: true });
      } catch {
        // already exists
      }
    }
  }
}
