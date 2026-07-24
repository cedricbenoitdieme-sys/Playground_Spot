async function run() {
  try {
    const mockToken = 'mock-token-a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'; // Cedric's ID
    const uniqueEmail = `test.gerant.api.${Date.now()}@gmail.com`;
    
    console.log('Sending create-gerant request to http://localhost:3000/api/create-gerant...');
    const response = await fetch('http://localhost:3000/api/create-gerant', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${mockToken}`
      },
      body: JSON.stringify({
        nom: 'Test Gerant API',
        email: uniqueEmail,
        tel: '771234567',
        quartier: 'Ouakam'
      })
    });

    console.log('Response Status:', response.status);
    const text = await response.text();
    console.log('Response Body:', text);
  } catch (err) {
    console.error('Error:', err);
  }
}

run();
