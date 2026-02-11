/**
 * BuildValidator — Phase 3
 *
 * Validates build artifacts after a successful compilation and monitors
 * performance characteristics (bundle size, build time) to detect regressions.
 *
 * Integration:
 *  - Called by ExecutionFeedbackLoop after the build phase succeeds
 *  - Reads the WebContainer file system to inspect output artifacts
 *  - Results flow into AgentEvaluationSystem metrics
 */

import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('BuildValidator');

type WebContainer = any;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface BuildArtifact {
  path: string;
  sizeBytes: number;
  type: 'js' | 'css' | 'html' | 'map' | 'image' | 'font' | 'other';
}

export interface BundleSizeReport {
  totalSize: number;
  jsSize: number;
  cssSize: number;
  mapSize: number;
  otherSize: number;
  artifacts: BuildArtifact[];
  largestFiles: BuildArtifact[];
}

export interface BuildValidationResult {
  valid: boolean;
  artifactCount: number;
  bundleSize: BundleSizeReport;
  issues: BuildIssue[];
  buildTime: number;
  performanceRegression: boolean;
}

export interface BuildIssue {
  severity: 'error' | 'warning' | 'info';
  category: 'missing-artifact' | 'size-regression' | 'empty-output' | 'suspicious-content' | 'slow-build';
  message: string;
  file?: string;
}

export interface BuildBaseline {
  totalSize: number;
  buildTime: number;
  artifactCount: number;
  timestamp: number;
}

export interface BuildValidatorConfig {
  /** Common output directories to look for, in priority order */
  buildDirs?: string[];
  /** Max acceptable bundle size increase as a fraction (default 0.20 = 20%) */
  sizeRegressionThreshold?: number;
  /** Max acceptable build time increase as a fraction */
  timeRegressionThreshold?: number;
  /** Warn if any single JS bundle exceeds this many bytes */
  maxSingleBundleSize?: number;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class BuildValidator {
  private config: Required<BuildValidatorConfig>;
  private baselines: BuildBaseline[] = [];
  private static readonly MAX_BASELINES = 10;

  constructor(config: BuildValidatorConfig = {}) {
    this.config = {
      buildDirs: config.buildDirs ?? ['dist', 'build', 'out', '.next', 'public'],
      sizeRegressionThreshold: config.sizeRegressionThreshold ?? 0.20,
      timeRegressionThreshold: config.timeRegressionThreshold ?? 0.50,
      maxSingleBundleSize: config.maxSingleBundleSize ?? 500 * 1024, // 500 KB
    };

    logger.info('BuildValidator initialized');
  }

  // -------------------------------------------------------------------------
  // Main validation
  // -------------------------------------------------------------------------

  /**
   * Validate build output after a successful build command.
   */
  async validate(
    webcontainer: WebContainer,
    workDir: string,
    buildTime: number,
  ): Promise<BuildValidationResult> {
    const issues: BuildIssue[] = [];

    // 1. Find the build output directory
    const buildDir = await this.findBuildDir(webcontainer, workDir);

    if (!buildDir) {
      return {
        valid: false,
        artifactCount: 0,
        bundleSize: this.emptyBundleReport(),
        issues: [{
          severity: 'error',
          category: 'missing-artifact',
          message: `No build output directory found. Checked: ${this.config.buildDirs.join(', ')}`,
        }],
        buildTime,
        performanceRegression: false,
      };
    }

    // 2. Scan artifacts
    const artifacts = await this.scanArtifacts(webcontainer, buildDir, buildDir);

    if (artifacts.length === 0) {
      issues.push({
        severity: 'error',
        category: 'empty-output',
        message: `Build directory "${buildDir}" is empty`,
      });
    }

    // 3. Build bundle size report
    const bundleSize = this.buildSizeReport(artifacts);

    // 4. Check for oversized bundles
    for (const artifact of artifacts) {
      if (artifact.type === 'js' && artifact.sizeBytes > this.config.maxSingleBundleSize) {
        issues.push({
          severity: 'warning',
          category: 'size-regression',
          message: `Large JS bundle: ${artifact.path} (${this.formatBytes(artifact.sizeBytes)})`,
          file: artifact.path,
        });
      }
    }

    // 5. Check for empty files (suspicious)
    for (const artifact of artifacts) {
      if (artifact.sizeBytes === 0 && artifact.type !== 'map') {
        issues.push({
          severity: 'warning',
          category: 'suspicious-content',
          message: `Empty file in build output: ${artifact.path}`,
          file: artifact.path,
        });
      }
    }

    // 6. Compare against baseline
    let performanceRegression = false;
    const baseline = this.getAverageBaseline();

    if (baseline) {
      // Size regression
      if (bundleSize.totalSize > baseline.totalSize * (1 + this.config.sizeRegressionThreshold)) {
        const increase = ((bundleSize.totalSize / baseline.totalSize) - 1) * 100;
        issues.push({
          severity: 'warning',
          category: 'size-regression',
          message: `Bundle size increased by ${increase.toFixed(1)}% `
            + `(${this.formatBytes(bundleSize.totalSize)} vs baseline ${this.formatBytes(baseline.totalSize)})`,
        });
        performanceRegression = true;
      }

      // Build time regression
      if (buildTime > baseline.buildTime * (1 + this.config.timeRegressionThreshold)) {
        const increase = ((buildTime / baseline.buildTime) - 1) * 100;
        issues.push({
          severity: 'warning',
          category: 'slow-build',
          message: `Build time increased by ${increase.toFixed(1)}% `
            + `(${buildTime}ms vs baseline ${Math.round(baseline.buildTime)}ms)`,
        });
        performanceRegression = true;
      }
    }

    // 7. Record this run as a new baseline data point
    this.recordBaseline({
      totalSize: bundleSize.totalSize,
      buildTime,
      artifactCount: artifacts.length,
      timestamp: Date.now(),
    });

    const hasErrors = issues.some(i => i.severity === 'error');

    const result: BuildValidationResult = {
      valid: !hasErrors,
      artifactCount: artifacts.length,
      bundleSize,
      issues,
      buildTime,
      performanceRegression,
    };

    logger.info('Build validation complete', {
      valid: result.valid,
      artifacts: result.artifactCount,
      totalSize: this.formatBytes(bundleSize.totalSize),
      issues: issues.length,
    });

    return result;
  }

  // -------------------------------------------------------------------------
  // Baseline management
  // -------------------------------------------------------------------------

  recordBaseline(baseline: BuildBaseline): void {
    this.baselines.push(baseline);

    if (this.baselines.length > BuildValidator.MAX_BASELINES) {
      this.baselines.shift();
    }
  }

  getAverageBaseline(): BuildBaseline | null {
    if (this.baselines.length === 0) return null;

    const avg: BuildBaseline = {
      totalSize: 0,
      buildTime: 0,
      artifactCount: 0,
      timestamp: Date.now(),
    };

    for (const b of this.baselines) {
      avg.totalSize += b.totalSize;
      avg.buildTime += b.buildTime;
      avg.artifactCount += b.artifactCount;
    }

    const n = this.baselines.length;
    avg.totalSize = Math.round(avg.totalSize / n);
    avg.buildTime = Math.round(avg.buildTime / n);
    avg.artifactCount = Math.round(avg.artifactCount / n);

    return avg;
  }

  clearBaselines(): void {
    this.baselines = [];
  }

  // -------------------------------------------------------------------------
  // File system scanning
  // -------------------------------------------------------------------------

  private async findBuildDir(wc: WebContainer, workDir: string): Promise<string | null> {
    for (const dir of this.config.buildDirs) {
      const fullPath = `${workDir}/${dir}`;

      try {
        await wc.fs.readdir(fullPath);
        return fullPath;
      } catch {
        // not found — try next
      }
    }

    return null;
  }

  /**
   * Recursively scan a directory and return all files as BuildArtifact[].
   */
  private async scanArtifacts(
    wc: WebContainer,
    dirPath: string,
    rootDir: string,
  ): Promise<BuildArtifact[]> {
    const artifacts: BuildArtifact[] = [];

    try {
      const entries = await wc.fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = `${dirPath}/${entry.name}`;

        if (entry.isDirectory()) {
          const nested = await this.scanArtifacts(wc, fullPath, rootDir);
          artifacts.push(...nested);
        } else {
          try {
            const content = await wc.fs.readFile(fullPath, 'utf-8');
            const sizeBytes = new Blob([content]).size;

            artifacts.push({
              path: fullPath.replace(rootDir + '/', ''),
              sizeBytes,
              type: this.classifyFile(entry.name),
            });
          } catch {
            // binary file or read error — estimate size as 0
            artifacts.push({
              path: fullPath.replace(rootDir + '/', ''),
              sizeBytes: 0,
              type: this.classifyFile(entry.name),
            });
          }
        }
      }
    } catch (err) {
      logger.warn(`Failed to scan directory ${dirPath}:`, err);
    }

    return artifacts;
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private buildSizeReport(artifacts: BuildArtifact[]): BundleSizeReport {
    const jsSize = artifacts.filter(a => a.type === 'js').reduce((s, a) => s + a.sizeBytes, 0);
    const cssSize = artifacts.filter(a => a.type === 'css').reduce((s, a) => s + a.sizeBytes, 0);
    const mapSize = artifacts.filter(a => a.type === 'map').reduce((s, a) => s + a.sizeBytes, 0);
    const otherSize = artifacts
      .filter(a => !['js', 'css', 'map'].includes(a.type))
      .reduce((s, a) => s + a.sizeBytes, 0);

    const sorted = [...artifacts].sort((a, b) => b.sizeBytes - a.sizeBytes);

    return {
      totalSize: jsSize + cssSize + mapSize + otherSize,
      jsSize,
      cssSize,
      mapSize,
      otherSize,
      artifacts,
      largestFiles: sorted.slice(0, 5),
    };
  }

  private classifyFile(name: string): BuildArtifact['type'] {
    if (/\.m?[jt]sx?$/.test(name)) return 'js';
    if (/\.css$/.test(name)) return 'css';
    if (/\.html?$/.test(name)) return 'html';
    if (/\.map$/.test(name)) return 'map';
    if (/\.(png|jpe?g|gif|svg|webp|ico|avif)$/.test(name)) return 'image';
    if (/\.(woff2?|ttf|otf|eot)$/.test(name)) return 'font';

    return 'other';
  }

  private emptyBundleReport(): BundleSizeReport {
    return {
      totalSize: 0,
      jsSize: 0,
      cssSize: 0,
      mapSize: 0,
      otherSize: 0,
      artifacts: [],
      largestFiles: [],
    };
  }

  private formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;

    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
}
