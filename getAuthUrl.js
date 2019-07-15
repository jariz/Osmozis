const fetch = require('node-fetch');

exports.getAuthUrl = () => fetch('http://www.wifi69.com', { redirect: 'manual' })
    .then(resp => resp.headers.get('location'));
