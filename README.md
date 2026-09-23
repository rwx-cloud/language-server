# RWX Language Server

This is a language server for [RWX](https://www.rwx.com)

The server uses the same saved access token as the RWX CLI by default. Lookup
order is:

1. `initializationOptions.accessToken`, including an explicit empty string for anonymous access.
2. A nonempty `RWX_ACCESS_TOKEN` environment variable.
3. `~/.config/rwx/accesstoken`.
4. `~/.mint/accesstoken`, only when the primary file is missing.

File contents are trimmed. An empty primary file selects anonymous access rather
than falling back to the legacy file. Missing files select anonymous access;
other read errors fail initialization. The home directory comes from `HOME`
(`USERPROFILE` on Windows), matching the CLI. `XDG_CONFIG_HOME` is not used.
Unlike the CLI, the server reads the legacy token without migrating it.

Without a token, public packages remain available.
Restart the server after changing credentials. Authenticated registry requests
are not cached, so subsequent requests recheck access with RWX Cloud.
