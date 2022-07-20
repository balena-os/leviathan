# Debugging tests in Leviathan

To improve workflow and write tests faster on Levaithan, the following debug options can be triggered to alter the behavior of test runs. A `debug` object can be added to the `config.js` file right with the existing suite's config. Additionally, the `debug` object can also have custom options as per the need of the test suite. These properties will become available during the test run and can be used to further customize the test run as needed. Example of a debug object:

```js
    debug: {
        failFast: false,
        globalFailFast: false,
        preserveDownloads: false,
        unstable: ["TITLE OF THE TEST 1", "TITLE OF THE TEST 2"]
        // Custom value 
        CUSTOM_OPTION: 'Verycustomindeed',
    },
```

The supported debug options available are as follows:

1. `failFast`: Exit the ongoing test suite if a test fails. Type: `Boolean`. Value: `true` or `false`. Default: `true`.
2. `preserveDownloads`: Persist downloadeded artifacts. Type: `Boolean`. Value: `true` or `false`. Default: `false`.
3. `globalFailFast`: Exit the entire ongoing test run if a test fails. Type: `Boolean`. Value: `true` or `false`. Default: `false`.
4. `unstable`: Add titles of the test suite that need to be marked unstable in order to have them skipped from a test suite. Skipped tests are marked as `todo` in the test logs and `skipped` in the test results. Type: `Array`.

You can use `this.suite.options` to access the `CUSTOM_OPTION` property in your test suite.

Checkout the [config.example.js](https://github.com/balena-os/leviathan/blob/master/workspace/config.example.js) file for a complete example.