const TestExecutor = require("./test-executor");
const config = require("./config");

class TestbotExecutor extends TestExecutor {
  executeTest(testSuite, deviceUuid, settings) {
    console.log("QemuExecutor - To be implemented");
  }
}

module.exports = new TestbotExecutor();
