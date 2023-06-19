const innerSchema = {
	type: 'object',
	properties: {
		deviceType: {
			type: 'string',
		},
		suite: {
			type: 'string',
		},
		config: {
			oneOf: [
				{
					type: 'object',
				},
				{
					type: 'string',
				},
			],
		},
		image: {
			type: ['string'],
			format: 'uri'
		},
		workers: {
			oneOf: [
				{
					type: 'array',
					items: {
						type: 'string',
						format: 'uri',
					},
				},
				{
					type: 'object',
					properties: {
						balenaApplication: {
							type: 'string',
						},
						apiKey: {
							type: 'string',
						},
					},
					required: ['apiKey', 'balenaApplication'],
				},
			],
		},
	},
	debug: {
		type: 'object',
		properties: {
			preserveDownloads: {
				type: 'boolean',
			},
			globalFailFast: {
				type: 'boolean',
			},
			failFast: {
				type: 'boolean',
			},
		},
	},
	required: ['deviceType', 'suite', 'config', 'image', 'workers'],
};

module.exports = {
	oneOf: [
		{
			type: 'array',
			items: innerSchema,
		},
		innerSchema,
	],
};
