// Flat mapping of dotted key paths to their descriptions, extracted from the RWX YAML JSON schema.
// Used to provide hover information and documentation for keys in RWX YAML files.

export interface KeyDescriptionEntry {
  description: string | null;
  documented?: boolean; // default true
  autocomplete?: boolean; // default true
}

export type KeyDescriptionValue = string | KeyDescriptionEntry;

/** Returns the human-readable description for a key path, or null if missing/suppressed. */
export function getKeyDescription(path: string): string | null {
  const entry = keyDescriptions[path];
  if (entry === undefined) return null;
  if (typeof entry === "string") return entry;
  return entry.description;
}

/** Whether the key should appear in autocomplete suggestions (default true). */
export function isKeyAutocomplete(path: string): boolean {
  const entry = keyDescriptions[path];
  if (entry === undefined) return true;
  if (typeof entry === "string") return true;
  return entry.autocomplete !== false;
}

/** Whether the key should appear in hover docs (default true). */
export function isKeyDocumented(path: string): boolean {
  const entry = keyDescriptions[path];
  if (entry === undefined) return true;
  if (typeof entry === "string") return true;
  return entry.documented !== false;
}

export const keyDescriptions: Record<string, KeyDescriptionValue> = {
  // Top-level properties
  tasks:
    "An array of task definitions that form the core execution units of your workflow. Each task represents a discrete unit of work that executes in an isolated containerized environment. Tasks can execute shell commands, call reusable packages, or embed other run definitions. Tasks support sophisticated dependency management through 'use' (inherits outputs and filesystem) and 'after' (ordering only), enabling complex workflows with parallel execution, content-based caching, and flexible artifact management.",
  on: "Trigger configuration that defines when and how this run should execute. RWX supports five trigger types: GitHub events (push, pull_request, merge_group), GitLab events (push, tag-push, merge-request), scheduled cron runs, manual CLI execution, and API dispatch triggers. Each trigger provides rich event context accessible via template expressions (e.g., ${{ event.git.branch }}, ${{ event.github.push.head_commit.message }}). Triggers can specify conditions (if), initialization parameters (init), target tasks (target), and custom run titles (title). Event data flows into tasks through initialization parameters, enabling dynamic workflow behavior based on trigger context.",
  "concurrency-pools":
    "Configuration for concurrency pools that limit the number of concurrent runs executing based on pool identifiers. Pools are global to your organization (not repository-scoped) and help manage resource contention. When capacity is exceeded, you can configure whether additional runs should queue, cancel waiting runs, or cancel currently running runs. Concurrency pools are commonly used for ordering deployments, cancelling feature branch workflows when a newer commit is pushed, and managing shared resource access. The best practice is to include the repository name in pool ID to avoid conflicts (e.g., 'my-org/my-repo:deployment').",
  "tool-cache":
    "Global tool cache configuration that enables incremental caching for tasks across runs. Tool caches preserve filesystem contents from previous task executions, allowing tasks like dependency installations to perform incremental updates instead of starting from scratch. When a task has a cache miss, the tool cache provides the filesystem state from the most recent execution. Tool caches are evicted after 48 hours and must be configured with a vault for security. Tool caches are useful for package managers (npm, yarn, bundle), Docker builds, compilation tasks, and other tasks that benefit from incremental updates.",
  base: "Base container layer configuration that defines the operating system, version, and RWX configuration tag for task execution. All tasks in the run use this base layer. The currently supported base layers are Ubuntu 22.04 (tag 1.1) and Ubuntu 24.04 (tag 1.2). The base layer determines available system packages, pre-installed Docker version, and tool cache compatibility. Different embedded runs can specify different base layers than their parent run.",
  aliases:
    "YAML aliases defined at the top level for reuse across the run definition. Aliases allow you to define common configurations once and reference them throughout the file using YAML anchors (&name) and aliases (*name).",

  // Task properties (merged from CommandTask, PackageTask, EmbeddedRunTask)
  "tasks[].key":
    "A unique identifier for the task used both for referencing the task and for display purposes. Must start with a letter, number, or underscore, followed by any combination of letters, numbers, underscores, or hyphens. Keys serve as display names in the UI and logs and must be unique within the run definition. Kebab-case and nouns are recommended (e.g. `frontend-build`, `gems`, `dependencies`, `unit-tests`.",
  "tasks[].run":
    "The shell command(s) to execute in the task container. The run command can be a single command string, a multi-line string using YAML's pipe (|) operator, or an array of command strings executed sequentially. Commands run in a bash shell with full access to environment variables, pipes, and redirects, and they support template expressions like ${{ init.parameter }} for dynamic command generation. Multi-line strings preserve formatting and are ideal for complex scripts.",
  "tasks[].use":
    "The dependencies of this task. Used tasks provide both execution ordering and inheritance of file system contents and environment variables. Files from dependency tasks are merged into this task's workspace in the order specified. If multiple dependencies produce the same file, the last dependency in the list takes precedence. Environment variables exported by dependencies (via $RWX_ENV) are automatically available in this task.",
  "tasks[].after":
    "The tasks that must run before this task will execute. Unlike 'use', no files or environment variables are inherited from the specified tasks. `after` supports expressions for conditional execution based on task status (e.g., `${{ task.failed && other-task.succeeded }}`). When tasks are referenced without a status (e.g. `after: [task-one, task-two]`), this task will only execute if the referenced tasks completed successfully. If the tasks fail or are skipped, this task will also be skipped.",
  "tasks[].if":
    "A boolean expression that determines whether the task executes. If false, the task is skipped along with any dependent tasks. Supports template expressions with boolean operators (&&, ||), comparison operators (==, !=), regex matching (=~, !~), and utility functions (starts-with, contains, etc.).",
  "tasks[].agent":
    "The compute resource requirements for the task execution agent. The default agent is 2 CPUs, 8GB memory, and 50GB disk. Agent memory (with units like 'gb'), CPU count, disk space (in 50GB increments), and special features like static IPs or tmpfs can all be configured. Choose agent specifications based on task requirements - use larger agents for compilation or data processing, smaller agents for simple operations. Different tasks within a run can use different agent specifications for cost optimization, so a dependency install can use a large agent while a test task using those dependencies can use a small one.",
  "tasks[].app": {
    description: "",
    documented: false,
    autocomplete: false,
  },
  "tasks[].app.endpoint": {
    description: "",
    documented: false,
    autocomplete: false,
  },
  "tasks[].app.port": {
    description: "",
    documented: false,
    autocomplete: false,
  },
  "tasks[].docker":
    "The docker daemon configuration for container operations within the task. Options: 'true' (basic Docker with cleanup), 'preserve-data' (Docker with persistence for images, volumes, build cache), or 'false' (disabled). The preserve-data option is useful for pre-pulling and caching large container images, sharing Docker volumes between dependent tasks, enabling incremental Docker builds with build cache, and setting up persistent database containers for testing.",
  "tasks[].parallel":
    "Parallelism configuration for generating multiple task instances with different parameters. Types: 'total' (numeric value creating indexed parallel tasks), 'matrix' (all combinations of specified variable arrays), 'values' (explicit array of parameter objects). Generated tasks receive context variables like parallel.index, parallel.total, and parallel.<variable-name>.",
  "tasks[].env":
    "Environment variable configuration for task execution context. Formats: simple key-value pairs or advanced objects with 'value' and 'cache-key' properties. Cache behavior: 'included' (default, variable value affects cache key), 'excluded' (variable ignored for caching, enabling cache hits with ephemeral values like credentials). Tasks can export variables to $RWX_ENV for use in dependent tasks. Variables from 'use' dependencies are automatically inherited.",
  "tasks[].env-config":
    "Configuration for how environment variables from dependency tasks are merged. Default behavior: later tasks in 'use' array overwrite earlier values. Special case: PATH is automatically joined with ':' separator. Merge configuration: 'strategy: join' concatenates values with specified separator. Primarily used for PATH-like variables that need combining rather than replacement.",
  "tasks[].cache":
    "Configure content-based caching behavior for the task. Mint automatically caches tasks based on their inputs, but you can control caching with boolean values or TTL (time-to-live) settings. When disabled, tasks will always execute. TTL formats: '1 min/minute', '1 hr/hour', '1 day' for automatic cache expiration. When configured with a TTL, caches will automatically expire after the specified duration.",
  "tasks[].tool-cache":
    "Reference to a named tool cache for incremental caching. The tool cache preserves the filesystem contents from previous executions of this task, enabling incremental updates when the task has a cache miss. Particularly effective for dependency installation tasks like npm install, bundle install, or yarn install. Tool cache names should be unique within the vault and descriptive of their purpose. The global tool-cache vault configuration must be set for task-level tool caches to function.",
  "tasks[].filter":
    "Specify which files from the workspace should be present for the task execution. Filters use glob patterns and improve cache hit rates by ensuring tasks only depend on relevant files. Only affects the workspace directory (/var/mint-workspace), not system files. Supports patterns: '*' (match within segment), '**' (match across segments), '{}' (comma-delimited options), '!' (negate/exclude). Arrays can contain strings, nested arrays (useful with YAML aliases), or objects with 'path' and 'cache-key' properties.",
  "tasks[].background-processes":
    "Define background services that run alongside the main task command. Supports ready checks to ensure services are available before the main command executes, and dependency sequencing between background processes. Processes start in parallel unless 'after' is specified. Default ready-check timeout: 60 seconds. Use service-specific tools for ready checks when possible.",
  "tasks[].outputs":
    "Configure different types of task outputs including file artifacts, test result parsing, output values for other tasks, and problem detection from logs or files. Artifacts are preserved as downloadable files, test results integrate with UI display, output values enable task communication via $MINT_VALUES directory, and problems support built-in matchers (eslint, rubocop, etc.) or custom formats.",
  "tasks[].timeout":
    "Maximum execution time for the task (default: 10 minutes), with a unit like 'm' or 'h' on the end (e.g. `timeout: 30m`). If the task runs longer than this timeout, it will be terminated with a SIGKILL signal (or SIGTERM if terminate-grace-period-seconds is set). The timeout applies to the entire task execution, including any background processes and their ready checks. Helps prevent runaway tasks from consuming resources indefinitely.",
  "tasks[].timeout-minutes":
    "Maximum execution time for the task in minutes (default: 10 minutes). If the task runs longer than this timeout, it will be terminated with a SIGKILL signal (or SIGTERM if terminate-grace-period-seconds is set). The timeout applies to the entire task execution, including any background processes and their ready checks. Helps prevent runaway tasks from consuming resources indefinitely.",
  "tasks[].terminate-grace-period-seconds":
    "Grace period in seconds to allow for clean shutdown when the task is terminated due to timeout or cancellation (default: 0 for immediate SIGKILL). During this period, the task process receives a SIGTERM signal and can perform cleanup operations (releasing locks, closing connections, saving state) before being forcefully terminated with SIGKILL. Essential for tasks that manage external resources like Terraform locks.",
  "tasks[].retry":
    "Retry configuration that specifies how many times to retry the task if it fails and what action to take on retry. Retries help handle transient failures like network issues, resource contention, or flaky tests. Each retry attempt gets a fresh execution environment. Advanced retry actions can be configured to customize retry behavior, set debug flags, or provide retry-specific data via $MINT_RETRY_ACTIONS directory.",
  "tasks[].health-timeout":
    "Maximum time for the agent to report its healthiness (e.g., '15m' or '1h'). If an agent has not reported that it is healthy within this time frame, the task will fail. The default value is 1 minute per 1 hour of configured timeout. This helps detect and handle unresponsive or stuck agents during task execution.",
  "tasks[].auto-cancel":
    "Whether to automatically cancel this task when superseded by a newer run. Supports template expressions.",
  "tasks[].bootstrapping": {
    description: "",
    documented: false,
    autocomplete: false,
  },
  "tasks[].call":
    "The package identifier or embedded run source. For packages: use name/version format (e.g., 'namespace/package-name 1.2.0') for semantic versioning or SHA-256 digest for exact version pinning. For embedded runs: a file path relative to the current run definition, an absolute path, or a template expression (commonly using ${{ run.mint-dir }}).",
  "tasks[].with":
    "Parameters to pass to the package. Each package defines its own parameter schema that specifies required and optional parameters with their types and defaults. Parameters can use template expressions to pass dynamic values like outputs from other tasks, initialization parameters, or event context. All values are converted to strings by the system.",
  "tasks[].init":
    "Initialization parameters to pass to the embedded run definition. These parameters are available as template variables in the embedded run using the 'init' namespace (e.g., ${{ init.environment }}). Allows customizing the behavior of reusable run definitions based on the calling context, enabling parameterized workflows that can adapt to different environments, configurations, or input data.",
  "tasks[].target":
    "Specific tasks within the embedded run to execute. If not specified, all tasks in the embedded run will be executed according to their dependencies. Allows selective execution of portions of larger run definitions, enabling modular workflow composition. Can be a single task key or an array of task keys. Dependencies of targeted tasks are automatically included.",
  "tasks[].inherit-init":
    "Whether the embedded run inherits initialization parameters from the parent run. When true, init parameters from the parent are passed through to the embedded run without needing to explicitly map them.",

  // Agent specification (tasks[].agent.*)
  "tasks[].agent.memory":
    "The memory allocation for the task execution environment, specified as a string followed by 'gb' (e.g. 16gb). Higher memory allocations allow for more memory-intensive tasks like large builds or data processing. RWX reserves 2GB RAM for internal use.",
  "tasks[].agent.cpus":
    "The number of CPU cores to allocate for the task. Can be specified as an integer or as a template expression. More CPUs enable parallel processing and faster execution for CPU-intensive tasks.",
  "tasks[].agent.disk":
    "The disk space allocation for the task execution environment, which can be specified as a simple string or as an object with a size property. Available in 50GB increments starting from 50GB (default). Larger disk allocations support tasks that generate large artifacts or work with large datasets.",
  "tasks[].agent.disk.size": "Disk space allocation followed by 'gb'.",
  "tasks[].agent.static-ips":
    "A vault expression resolving to the static IPs to use for the task. Useful for tasks that need to be whitelisted by external services or require consistent network identity.",
  "tasks[].agent.tmpfs":
    "Whether to use tmpfs (in-memory filesystem) for improved I/O performance. Tmpfs is useful for tasks with heavy disk I/O that can benefit from memory-backed storage (e.g. task that install node modules), but requires sufficient memory allocation. Any tasks with significant filesystem I/O that fits in ~70% of available memory will benefit from tmpfs.",
  "tasks[].agent.spot":
    "Whether to use spot instances for task execution. When true, ephemeral instances are used that may be preempted at any time but offer cost savings. When false or omitted, standard on-demand instances are used with guaranteed availability and stable performance. Choose spot instances for fault-tolerant workloads that can handle interruptions. Tasks with spot agents that are interrupted are automatically retried by RWX.",
  "tasks[].agent.placement": {
    description: "",
    documented: false,
    autocomplete: false,
  },
  "tasks[].agent.ipv6":
    "Whether to enable IPv6 networking for the task agent. Supports template expressions.",

  // Parallel configuration (tasks[].parallel.*)
  "tasks[].parallel.key":
    "A custom naming pattern for generated parallel tasks. Supports template expressions using parallel variables (e.g., 'build-${{ parallel.os }}-${{ parallel.arch }}'). If not specified, tasks are named based on the parallel field and given numeric suffixes.",
  "tasks[].parallel.tasks-limit":
    "The maximum number of parallel tasks to run concurrently (default: 16, max: 256). This field is designed to prevent accidentally running hundreds of tasks with an incorrect parallel configuration and can be safely increased to the level of parallelism you expect to run.",
  "tasks[].parallel.total":
    "The total number of parallel executions to create (0 to n-1). Each execution gets its own parallel.index and parallel.total variables accessible via ${{ parallel.index }} and environment variables $RWX_PARALLEL_INDEX, $RWX_PARALLEL_TOTAL.",
  "tasks[].parallel.matrix":
    "Matrix parallelism creates all combinations of specified variable arrays. Each combination becomes a separate parallel execution with access to the matrix variables via ${{ parallel.variable-name }}. The cartesian product of all specified array will be generated.",
  "tasks[].parallel.values":
    "An explicit list of parameter objects for parallel execution. Each object becomes a separate parallel execution with access to the specified variables via ${{ parallel.variable-name }}. All objects must have the same keys. This is useful when you need specific combinations rather than the cartesian product.",
  "tasks[].parallel.auto-cancel":
    "Whether to automatically cancel parallel tasks when superseded by a newer run. Supports template expressions.",

  // Environment variable object properties
  "tasks[].env.*.value":
    "The environment variable value. Supports template expressions for dynamic values from other tasks, initialization parameters, or event context.",
  "tasks[].env.*.cache": {
    description: "",
    documented: false,
    autocomplete: false,
  },
  "tasks[].env.*.cache-key":
    "Whether this environment variable should be included in cache key generation. 'included' (default): variable value affects cache key. 'excluded': variable ignored for caching, enabling cache hits with ephemeral values like credentials.",

  // Environment configuration (tasks[].env-config.*)
  "tasks[].env-config.inherit":
    "Inherit environment variables from dependency tasks. 'all-used-tasks' inherits from all tasks listed in 'use', or specify an array of specific task keys. Note: inheritance is automatic for 'use' dependencies; this setting provides explicit control.",
  "tasks[].env-config.merge":
    "Merge strategies for environment variables with the same name from multiple sources.",
  "tasks[].env-config.merge.*.strategy":
    "Merge strategy for this environment variable. Use 'join' to concatenate values from multiple sources with a separator.",
  "tasks[].env-config.merge.*.by":
    "Separator string for join strategy. Common values: ':' for PATH-like variables, ',' for comma-separated lists, ' ' for space-separated values.",

  // Cache configuration (tasks[].cache.*)
  "tasks[].cache.enabled": "Whether caching is enabled for this task.",
  "tasks[].cache.ttl":
    "Time-to-live for cache entries. Supported formats: '1 min', '1 minute', '2 mins', '2 minutes', '1 hr', '1 hour', '2 hrs', '2 hours', '1 day', '2 days'. Cache entries automatically expire after the specified duration.",

  // Background processes (tasks[].background-processes[].*)
  "tasks[].background-processes[].key":
    "Unique identifier for the background process within the task. Used for process ordering with 'after' dependencies and in logs/UI for identification.",
  "tasks[].background-processes[].run":
    "Command to execute for the background process. Runs in the same containerized environment as the main task with access to the same filesystem and environment variables.",
  "tasks[].background-processes[].ready-check":
    "Configuration for checking when the background process is ready to receive requests. Can be a simple command string, array of commands, or detailed object with timeout configuration. Ready checks run repeatedly until they succeed or timeout. Use service-specific ready check commands when possible rather than generic port checks.",
  "tasks[].background-processes[].ready-check.run":
    "Command or commands to run to check if the background process is ready. Should be lightweight and idempotent. Use service-specific tools when possible (e.g., pg_isready for PostgreSQL, redis-cli ping for Redis).",
  "tasks[].background-processes[].ready-check.timeout-seconds":
    "Maximum time to wait for the ready check to succeed (default: 60 seconds). Ready checks are retried until timeout is reached.",
  "tasks[].background-processes[].after":
    "Other background processes that must be ready before starting this process. Can be a single process key or an array of process keys. Creates startup sequencing to handle service dependencies (e.g., database before web server).",
  "tasks[].background-processes[].terminate-grace-period-seconds":
    "Grace period for clean shutdown when terminating the background process (default: 10 seconds). Process receives SIGTERM, then SIGKILL after grace period. Allows time for cleanup operations like flushing data or closing connections.",

  // Output configuration (tasks[].outputs.*)
  "tasks[].outputs.execution-status":
    "Configuration for custom success/failure determination.",
  "tasks[].outputs.execution-status.success-exit-codes":
    "Exit codes that should be considered successful completion.",
  "tasks[].outputs.test-results":
    "Test result files to process and display in the UI.",
  "tasks[].outputs.test-results[].path": "Path to test result file.",
  "tasks[].outputs.test-results[].options":
    "Options for test result processing.",
  "tasks[].outputs.test-results[].options.framework": "Test framework name.",
  "tasks[].outputs.test-results[].options.language": "Programming language.",
  "tasks[].outputs.values":
    "Names of output values that other tasks can reference.",
  "tasks[].outputs.problems":
    "Problem detection configuration for parsing errors, warnings, and issues from task output.",
  "tasks[].outputs.problems[].matcher": "Problem matcher name or URL.",
  "tasks[].outputs.problems[].path": "Path to problem file.",
  "tasks[].outputs.problems[].format": "Format of the problem file.",
  "tasks[].outputs.artifacts":
    "Files or directories to collect as artifacts after task completion.",
  "tasks[].outputs.artifacts[].key": "Unique identifier for the artifact.",
  "tasks[].outputs.artifacts[].path": "File or directory path to collect.",
  "tasks[].outputs.filesystem":
    "Filesystem output configuration. Set to false to disable outputting a filesystem layer from this task, or configure filtering for preserving specific files after task completion.",
  "tasks[].outputs.filesystem.deduplicate":
    "Whether to deduplicate the output filesystem for this task. Deduplication reduces storage by eliminating duplicate file content.",
  "tasks[].outputs.filesystem.filter":
    "Filter configuration for filesystem outputs, specifying which files to preserve after task completion.",
  "tasks[].outputs.filesystem.filter.workspace":
    "Filter files from the workspace directory in filesystem output.",
  "tasks[].outputs.filesystem.filter.system":
    "Filter files from the system directory in filesystem output.",

  // Retry configuration (tasks[].retry.*)
  "tasks[].retry.count": "Number of retry attempts.",
  "tasks[].retry.if":
    "Condition for retrying. Supports template expressions to determine whether a retry should be attempted based on the failure context.",
  "tasks[].retry.action": "Action to take on retry.",

  // Filter object properties (uses parseGenericRecord — workspace is fixed, other keys are task names)
  "tasks[].filter.*": {
    description: "",
    documented: false,
    autocomplete: false,
  },
  "tasks[].filter.workspace": "Filter files from the workspace directory.",

  // Trigger properties (on.*)
  "on.github":
    "GitHub event triggers for automated run execution. Supports push events (on branch updates) and pull_request events (on PR lifecycle). Each trigger provides rich event context accessible via template expressions.",
  "on.gitlab":
    "GitLab event triggers for automated run execution. Supports push events (branch updates), tag-push events (tag creation), and merge-request events (MR lifecycle). Each trigger provides GitLab-specific event context and supports conditional execution, initialization parameters, target tasks, and custom run titles.",
  "on.cron":
    "Scheduled cron triggers for automated run execution using cron expressions with optional timezone specification. Each trigger requires a unique key and schedule. Provides rich event context including time fields in both schedule timezone and UTC. Useful for recurring workflows like nightly builds, cache warming, or scheduled deployments.",
  "on.cli": "Configuration for manual CLI-triggered runs.",
  "on.dispatch":
    "API dispatch triggers for programmatic run execution. Allows on-demand execution via CLI (`rwx dispatch`), API calls, or Cloud UI. Each trigger requires a unique key within your organization and can define parameters for user input. Parameters are accessible via event.dispatch.params context and must be explicitly mapped to initialization parameters. Provides flexible workflow orchestration for deployment pipelines, manual testing, or external integrations.",
  "on.cache-rebuild":
    "Cache rebuild triggers provide instructions to RWX about how to rebuild your content-based cache. These triggers are used to make the RWX cache even faster and more effective than it already is. Each trigger can specify initialization parameters, conditions, target tasks, custom titles, and a git reference to run the cache rebuild on.",
  "on.webhook":
    "Webhook triggers allow external systems to trigger runs via HTTP POST requests. Each webhook trigger requires a unique key within your organization that is used to generate the webhook URL. Webhooks can specify initialization parameters, conditions, target tasks, and custom run titles. Useful for integrating with external services, deployment systems, or custom automation tools.",

  // GitHub trigger properties
  "on.github.push":
    "Triggers for GitHub push events (branch updates, tag pushes). Can be a single trigger object or an array of trigger objects for different configurations. Provides event context: event.git.branch, event.git.sha, event.git.ref, event.git.tag, event.github.push.head_commit.message, event.github.push.repository.clone_url, event.github.push.sender.login.",
  "on.github.pull_request":
    "Triggers for GitHub pull request events (opened, reopened, synchronize, closed). Can be a single trigger object or an array of trigger objects. Default actions: [opened, reopened, synchronize]. Provides event context: event.git.branch, event.git.sha, event.git.ref, event.github.pull_request.number, event.github.pull_request.pull_request.title.",
  // GitHub push trigger properties
  "on.github.push.init":
    "Initialization parameters passed to the run or embedded run.",
  "on.github.push.if": "Condition for trigger activation.",
  "on.github.push.target": "Specific tasks to execute when triggered.",
  "on.github.push.title": "Custom title for the run.",
  "on.github.push.start":
    "Whether the run starts automatically when triggered or must be started manually.",
  "on.github.push.region":
    "The region in which to execute the run when this trigger fires.",
  "on.github.push.status-checks":
    "GitHub/GitLab status check configuration. Can be a boolean to enable/disable all checks, a string expression, an array of custom checks, or an object with default and custom check configurations. Status checks report task execution status back to the version control system.",

  // GitHub pull_request trigger properties
  "on.github.pull_request.init":
    "Initialization parameters passed to the run or embedded run.",
  "on.github.pull_request.if": "Condition for trigger activation.",
  "on.github.pull_request.target": "Specific tasks to execute when triggered.",
  "on.github.pull_request.title": "Custom title for the run.",
  "on.github.pull_request.start":
    "Whether the run starts automatically when triggered or must be started manually.",
  "on.github.pull_request.region":
    "The region in which to execute the run when this trigger fires.",
  "on.github.pull_request.actions":
    "PR actions that trigger the run. Available actions: 'opened' (PR is opened), 'reopened' (previously closed PR is reopened), 'synchronize' (PR branch is updated), 'closed' (PR is closed). Default: [opened, reopened, synchronize] if not specified.",
  "on.github.pull_request.status-checks":
    "GitHub/GitLab status check configuration. Can be a boolean to enable/disable all checks, a string expression, an array of custom checks, or an object with default and custom check configurations. Status checks report task execution status back to the version control system.",

  // GitLab trigger properties
  "on.gitlab.push": "Triggers for GitLab push events (branch updates).",
  "on.gitlab.tag-push": "Triggers for GitLab tag-push events (tag creation).",
  "on.gitlab.merge-request":
    "Triggers for GitLab merge request events (MR lifecycle).",

  // GitLab push trigger properties
  "on.gitlab.push.init":
    "Initialization parameters passed to the run or embedded run.",
  "on.gitlab.push.if": "Condition for trigger activation.",
  "on.gitlab.push.target": "Specific tasks to execute when triggered.",
  "on.gitlab.push.title": "Custom title for the run.",
  "on.gitlab.push.start":
    "Whether the run starts automatically when triggered or must be started manually.",
  "on.gitlab.push.region":
    "The region in which to execute the run when this trigger fires.",
  "on.gitlab.push.status-checks":
    "GitHub/GitLab status check configuration. Status checks report task execution status back to the version control system.",

  // GitLab tag-push trigger properties
  "on.gitlab.tag-push.init":
    "Initialization parameters passed to the run or embedded run.",
  "on.gitlab.tag-push.if": "Condition for trigger activation.",
  "on.gitlab.tag-push.target": "Specific tasks to execute when triggered.",
  "on.gitlab.tag-push.title": "Custom title for the run.",
  "on.gitlab.tag-push.start":
    "Whether the run starts automatically when triggered or must be started manually.",
  "on.gitlab.tag-push.region":
    "The region in which to execute the run when this trigger fires.",
  "on.gitlab.tag-push.status-checks":
    "GitHub/GitLab status check configuration. Status checks report task execution status back to the version control system.",

  // GitLab merge-request trigger properties
  "on.gitlab.merge-request.init":
    "Initialization parameters passed to the run or embedded run.",
  "on.gitlab.merge-request.if": "Condition for trigger activation.",
  "on.gitlab.merge-request.target": "Specific tasks to execute when triggered.",
  "on.gitlab.merge-request.title": "Custom title for the run.",
  "on.gitlab.merge-request.start":
    "Whether the run starts automatically when triggered or must be started manually.",
  "on.gitlab.merge-request.region":
    "The region in which to execute the run when this trigger fires.",
  "on.gitlab.merge-request.actions":
    "Merge request actions that trigger the run.",
  "on.gitlab.merge-request.status-checks":
    "GitHub/GitLab status check configuration. Status checks report task execution status back to the version control system.",

  // Cron trigger properties
  "on.cron[].key":
    "Unique identifier for the cron trigger. Must be unique within the organization. Used for identification in logs, UI, and manual trigger execution via CLI.",
  "on.cron[].schedule":
    "Cron expression for scheduling with optional timezone. Standard format: 'minute hour day-of-month month day-of-week'. With timezone: '30 9 * * * America/New_York'. Default timezone: UTC. Provides event context: event.cron.year, event.cron.hour, event.cron.utc.hour, etc.",
  "on.cron[].init":
    "Initialization parameters passed to the run or embedded run.",
  "on.cron[].if": "Condition for trigger activation.",
  "on.cron[].target": "Specific tasks to execute when triggered.",
  "on.cron[].title": "Custom title for the run.",
  "on.cron[].branch": "Git branch to use for the run.",
  "on.cron[].reset-tool-cache": "Whether to reset tool cache.",
  "on.cron[].start":
    "Whether the run starts automatically when triggered or must be started manually.",
  "on.cron[].region":
    "The region in which to execute the run when this trigger fires.",

  // CLI trigger properties
  "on.cli.init": "Initialization parameters passed to the run or embedded run.",
  "on.cli.title": "Custom title for CLI runs.",
  "on.cli.start":
    "Whether the run starts automatically when triggered or must be started manually.",
  "on.cli.region":
    "The region in which to execute the run when this trigger fires.",

  // Dispatch trigger properties
  "on.dispatch[].key":
    "Unique key for the dispatch trigger within your organization. Used for CLI dispatch commands (`rwx dispatch <key>`), API calls, and UI identification. Should be descriptive of the dispatch purpose (e.g., 'deploy-application', 'run-integration-tests').",
  "on.dispatch[].init":
    "Initialization parameters passed to the run or embedded run.",
  "on.dispatch[].if": "Condition for trigger activation.",
  "on.dispatch[].target": "Specific tasks to execute when triggered.",
  "on.dispatch[].title": "Custom title for the dispatch run.",
  "on.dispatch[].params":
    "Parameters that can be provided when dispatching. Each parameter defines input fields for users to specify when triggering the dispatch. Parameters are accessible via ${{ event.dispatch.params.parameter-key }} and must be mapped to initialization parameters in the 'init' section. Supports default values and required validation.",
  "on.dispatch[].start":
    "Whether the run starts automatically when triggered or must be started manually.",
  "on.dispatch[].region":
    "The region in which to execute the run when this trigger fires.",

  // Dispatch param properties
  "on.dispatch[].params[].key":
    "Parameter key for referencing via ${{ event.dispatch.params.key-name }}. Should be descriptive and follow naming conventions.",
  "on.dispatch[].params[].name":
    "Human-readable display name shown in UI and CLI prompts. Should be clear and descriptive for users.",
  "on.dispatch[].params[].description": "Parameter description.",
  "on.dispatch[].params[].default": "Default value.",
  "on.dispatch[].params[].required": "Whether parameter is required.",

  // Cache rebuild trigger properties
  "on.cache-rebuild[].init":
    "Initialization parameters passed to the run or embedded run.",
  "on.cache-rebuild[].if": "Condition for trigger activation.",
  "on.cache-rebuild[].target": "Specific tasks to execute when triggered.",
  "on.cache-rebuild[].title": "Custom title for the cache rebuild run.",
  "on.cache-rebuild[].ref":
    "Git reference (branch, tag, or commit) to run the cache rebuild on.",
  "on.cache-rebuild[].start":
    "Whether the run starts automatically when triggered or must be started manually.",
  "on.cache-rebuild[].region":
    "The region in which to execute the run when this trigger fires.",

  // Webhook trigger properties
  "on.webhook[].key":
    "Unique key for the webhook trigger within your organization. Used for webhook URL generation.",
  "on.webhook[].init":
    "Initialization parameters passed to the run or embedded run.",
  "on.webhook[].if": "Condition for trigger activation.",
  "on.webhook[].target": "Specific tasks to execute when triggered.",
  "on.webhook[].title": "Custom title for the webhook run.",
  "on.webhook[].start":
    "Whether the run starts automatically when triggered or must be started manually.",
  "on.webhook[].region":
    "The region in which to execute the run when this trigger fires.",

  // Status checks properties
  "status-checks.default":
    "Configuration for the default status check that reports overall run status.",
  "status-checks.default.enabled":
    "Whether the default status check is enabled.",
  "status-checks.default.name": "Name for the default status check.",
  "status-checks.default.start-manually-behavior":
    "Behavior of the status check when the run is configured to start manually. Controls whether the check is reported immediately or waits until the run is started.",
  "status-checks.custom":
    "Custom status checks for specific tasks or task groups.",
  "status-checks.custom[].tasks": "Specific tasks to execute when triggered.",
  "status-checks.custom[].name": "Custom name for the status check.",

  // Concurrency pool properties
  "concurrency-pools[].id": "Unique identifier for the concurrency pool.",
  "concurrency-pools[].capacity":
    "Maximum number of concurrent tasks in this pool.",
  "concurrency-pools[].on-overflow":
    "Action to take when pool capacity is exceeded.",
  "concurrency-pools[].if": "Condition for pool activation.",

  // Tool cache properties
  "tool-cache.vault": "Vault to use for tool cache.",

  // Base layer properties
  "base.os":
    "Operating system for the base container layer. Currently supported values are 'ubuntu 24.04' and 'ubuntu 22.04'. The OS version determines available system packages and affects tool cache compatibility.",
  "base.image":
    "Docker image to use as the base container layer (e.g., 'ubuntu:24.04'). When specified, the task runs on this image instead of an RWX-managed OS. Cannot be combined with 'os'.",
  "base.config":
    "RWX base configuration package to apply on top of the image (e.g., 'rwx/base 1.0.0'). Provides pre-configured system tools and dependencies. Typically used together with 'image'.",
  "base.tag":
    "Mint configuration version tag that specifies the pre-configured software environment. Each tag represents a specific, tested configuration of system tools and dependencies. Used with 'os'.",
  "base.arch":
    "CPU architecture for task execution. Common values include 'x86', 'arm64', and 'x86_64'. Architecture selection affects agent allocation and compatibility with certain packages or Docker images.",
};
