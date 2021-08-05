module.exports = {
	title: 'Example test',
	run: async function(test) {
        test.comment(`Test 1`)
        test.ok(true, `Example test should pass`)

        // in the parent , `suite.js` where we set up the environment, we created a worker object and added it to the context - so here we get it from the context and use it to pipe a command to the DUT
        let hello = await this.context.get().worker.executeCommandInHostOS(
            'echo Hello',
            this.context.get().link,
        );

        test.is(hello, `Hello`, `Echo command should return "Hello", received ${hello}`)
    }
}