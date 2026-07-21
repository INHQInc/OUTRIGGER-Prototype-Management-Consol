/** Git integration types. Provider-agnostic surface; GitHub is the first impl. */

export interface RepoRef {
  owner: string;
  repo: string;
}

export interface RepoInfo extends RepoRef {
  defaultBranch: string;
  private: boolean;
  htmlUrl: string;
  permissions?: { push?: boolean; pull?: boolean; admin?: boolean };
}

/** A single repository pointer. */
export interface RepoConfig {
  provider: "github";
  owner: string;
  repo: string;
  /** Branch prototype branches are cut from / PR'd into. */
  baseBranch: string;
}

/**
 * Where a winner integrates, relative to the feature repo:
 *   same     — the feature repo IS the source (native flow: PR to base = ships)
 *   repo     — a different GitHub repo (winner PR'd there)
 *   external — read-only / non-GitHub source (e.g. Outrigger Azure) → handoff, no push
 */
export type SourceMode = "same" | "repo" | "external";

/** Per-site binding: where prototypes deploy from, and where winners integrate. */
export interface SiteRepoBinding {
  /**
   * Where prototypes live as branches. Each prototype branch builds a
   * self-contained variation at `artifactPath` (default dist/variation.js) that
   * the console pulls as the version's injectable code.
   */
  feature: RepoConfig & { branchPrefix: string; artifactPath?: string };
  sourceMode: SourceMode;
  /** Present only when sourceMode === "repo". */
  source?: RepoConfig;
}

/**
 * Roles a registered repo plays for a brand:
 *   prototypes — experiment code is built/branched here (console pulls artifacts)
 *   source     — the brand's production codebase (Ship: PR or handoff bundle)
 * One repo may play both (native flow: prototype branches in the real repo).
 */
export type RepoRole = "prototypes" | "source";

/**
 * Where the repo lives. `github` is fully integrated; `azure-devops` and
 * `external` are reference entries for the source role (no API yet — Ship
 * degrades to a handoff bundle instead of a PR).
 */
export type RepoProvider = "github" | "azure-devops" | "external";

/**
 * A repo registered at the BRAND (org) level. The brand registers as many as it
 * wants; each prototype picks a prototypes-role repo (+ branch). Defaults are
 * PER ROLE (defaultFor).
 */
export interface OrgRepo {
  id: string;          // `${orgId}:${fullName}`
  orgId: string;
  fullName: string;    // owner/repo (github) or a free-form locator (other providers)
  baseBranch: string;
  artifactPath: string; // built variation path on prototype branches
  roles: RepoRole[];
  provider: RepoProvider;
  /** Which roles this repo is the default pick for. */
  defaultFor: RepoRole[];
}

export interface PullRequestResult {
  number: number;
  url: string;
  branch: string;
}
