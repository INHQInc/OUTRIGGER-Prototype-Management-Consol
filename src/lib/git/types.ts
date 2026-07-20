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

/** Per-site (later per-prototype) binding to a source repository. */
export interface RepoBinding {
  provider: "github";
  owner: string;
  repo: string;
  /** Branch new prototype branches are cut from + PR'd back into. */
  baseBranch: string;
  /** Prefix for prototype branches, e.g. "prototype/". */
  branchPrefix: string;
}

export interface PullRequestResult {
  number: number;
  url: string;
  branch: string;
}
