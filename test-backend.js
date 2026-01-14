const https = require('https');

const url = 'https://ipms-enarxi.onrender.com/api/test';

console.log(`Testing Backend at: ${url}...`);

https.get(url, (res) => {
    let data = '';

    res.on('data', (chunk) => {
        data += chunk;
    });

    res.on('end', () => {
        if (res.statusCode === 200) {
            console.log('\n✅ SUCCESS: Backend is Online and Reachable!');
            try {
                const json = JSON.parse(data);
                console.log('\n--- Server Status ---');
                console.log(`Message:   ${json.message}`);
                console.log(`Database:  ${json.dbStatus}`);
                console.log(`Timestamp: ${json.timestamp}`);
                console.log('---------------------\n');
            } catch (e) {
                console.log('Response:', data);
            }
        } else {
            console.log(`\n⚠️ WARNING: Received Status code ${res.statusCode}`);
            console.log('Response Body:', data);
        }
    });

}).on('error', (err) => {
    console.error(`\n❌ ERROR: Could not connect to backend.`);
    console.error(`Details: ${err.message}`);
    console.error(`Suggestion: Check if the Render service is fully deployed and 'Active'.`);
});
