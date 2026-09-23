# RWX Language Server

This is a language server for [RWX](https://www.rwx.com)

To access your organization's private packages, pass an RWX access token in
`initializationOptions.accessToken`, or set `RWX_ACCESS_TOKEN` in the server's
environment. Initialization options take precedence; an explicit empty token
selects anonymous access. Without a token, public packages remain available.
Restart the server after changing credentials. Authenticated registry requests
are not cached, so subsequent requests recheck access with RWX Cloud.
