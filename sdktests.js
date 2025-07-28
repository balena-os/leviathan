// or with node require
const { getSdk } = require('balena-sdk');

const balena = getSdk({
    apiUrl: "https://api.balena-cloud.com/",
});



async function main() {
    await balena.auth.loginWithToken('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MTM1OTA0LCJqd3Rfc2VjcmV0IjoiNjNGVVE3VTJBUVNVWVcyVkJMQlQ3U1haWDNNQUFPVEgiLCJhdXRoVGltZSI6MTc1MzQzNjk0NDM5NSwicGVybWlzc2lvbnMiOlsic3VwcG9ydC5ob21lIl0sImlhdCI6MTc1MzQzNjk0NCwiZXhwIjoxNzUzNDgwMTQ0fQ.S9Zw4_ZeY9NLssNzA6jPIIZgi2sV8rNn9Oty98cUL1w');
    console.log(await balena.models.deviceType.getBySlugOrName('raspberry-pi'))



    const ob = {}
    ob.test = "hello"
    console.log(ob)
}

main()
