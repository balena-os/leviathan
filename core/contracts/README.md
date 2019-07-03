Resin.io Base Contracts
=======================

[![CircleCI](https://circleci.com/gh/resin-io/contracts/tree/master.svg?style=svg)](https://circleci.com/gh/resin-io/contracts/tree/master)

The collection of contracts and partials across the resin.io system.

Contracts
---------

Each contract is a `.json` file inside the `contracts/` directory. The
convention is to store one contract per file, located in
`contracts/<type>/<slug>.json`.

Partials
--------

This directory contains partials that apply to certain combinations of
contracts. The convention is to store a partial in
`partials/<combination>/<combination instantiation>/<partial>.tpl`. Here are
some examples:

```
partials/sw.os+arch.sw/debian+amd64/installation.tpl
partials/sw.os+arch.sw/debian/installation.tpl
partials/hw.device-type/ts4900/remove-install-media.tpl
```

The combination section defines the types of contracts that come into play for
a particular partials subtree, separated by a `+` symbol. If the combination is
`sw.os+arch.sw`, then it means that the subtree will take into account the
combination of operating systems and architectures. Note that there can be
combinations of a single type.

The combination instantiation section defines a subtree for a specific set of
contracts that match the combination type. If the combination is
`sw.os+arch.sw`, a valid combination instantiation can be `debian+amd64`, which
is the subtree that will be selected when matching the Debian GNU/Linux
contract with the amd64 architecture contract.

Note that a combination instantiation may use `@` symbols to define subtrees
for a specific version of one or more contracts in the combination. For
example, `debian@wheezy+amd64` will be the subtree containing partials for the
combination of Debian Wheezy and amd64.

You can also omit trailing portions of the combination instantiation to
implement wildcards. If the combination is `sw.os+arch.sw` and the
instantiation is `debian`, it means that such subtree will apply to the
combination of Debian GNU/Linux with *any* architecture.

The partial tree is then traversed from specific to general, until a match is
found. This is the path that the contract system will follow when searching for
the `download` template on the `sw.os+arch.sw` combination:

```
sw.os+arch.sw/<os>@<version>+<arch>@<version>/download.tpl
sw.os+arch.sw/<os>@<version>+<arch>/download.tpl
sw.os+arch.sw/<os>+<arch>@<version>/download.tpl
sw.os+arch.sw/<os>+<arch>/download.tpl
sw.os+arch.sw/<os>/download.tpl
```

Contribute
----------

- Issue Tracker: [github.com/resin-io/contracts/issues][issues]
- Source Code: [github.com/resin-io/contracts][source]

### Dependencies

- [Node.js][nodejs]


You can perform a set of static analysis checks to find the most common types
of errors by running:

```sh
npm test
```

License
-------

The project is licensed under the Apache 2.0 license.

[issues]: https://github.com/resin-io/contracts/issues
[source]: https://github.com/resin-io/contracts
[nodejs]: https://nodejs.org
