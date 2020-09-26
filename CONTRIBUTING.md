# Contributing

Please read through the [README](README.md) and [pkmn.cc/@pkmn](https://pkmn.cc/@pkmn/) for general
information about `@pkmn/stats` and about development on `@pkmn` projects respectively. When opening
issues or pull requests, please use one of the existing templates and fill them out to the best of
your ability. Pull requests are unlikely to be merged without tests, but it is fine to open a pull
request without tests for feedback or to ask for help with testing. :)

## `subpkg`

`subpkg` is a minimal utility for managing projects with sub-packages (compare to
[`lerna`](https://github.com/lerna/lerna) or `pnpm`'s support for
['workspaces'](https://pnpm.js.org/en/workspaces)). This project takes advantage of `subpkg` to
declare all shared `dependencies` in the root [`package.json`](package.json) which ensures that all
sub-packages end up using the same versions and each of the dependencies only need to be installed
once for the project instead of per-package. To avoid needing to run all scripts from the root of
the repository simply install `subpkg` and use `subpkg` in place of `npm` when running scripts from
anywhere in the project.

```sh
$ npm install -g subpkg
```

To run scripts for specific subpackages, simply specify the packages after the name of the script:

```sh
$ subpkg compile anon stats
```

`subpkg` provides a `bump` subcommand that allows for bumping the versions of specific
sub-packages and updating all of their dependants, as well as a `link` subcommand that can be run
after installation to point the internal packages at local versions instead of the published
releases.
