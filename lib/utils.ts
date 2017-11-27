'use strict'

exports.requireComponent = (name, instance) => {
  const COMPONENTS_DIRECTORY = './components'

  try {
    return require(`${COMPONENTS_DIRECTORY}/${name}/${instance}`)
  } catch (error) {
    if (error.code === 'MODULE_NOT_FOUND') {
      return require(`${COMPONENTS_DIRECTORY}/${name}/default`)
    }

    throw error
  }
}
