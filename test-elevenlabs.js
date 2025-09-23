require('dotenv').config();
const elevenLabsService = require('./src/services/elevenLabsService');

async function testElevenLabsTTS() {
    try {
        
        // Test the textToSpeechStream method
        const audioData = await elevenLabsService.textToSpeechStream(
					"Also could you please share your name"
				);
        
        if (audioData) {
            console.log('📊 Audio data:', audioData);
            // write the audio data as a textfile to a file for inspection
            const fs = require('fs');
            fs.writeFileSync('output_audio.txt', audioData);
            console.log('✅ Audio written to output_audio.txt');
            try {
                Buffer.from(audioData, 'base64');
                console.log('✅ Valid base64 format confirmed');
            } catch (e) {
                console.log('❌ Invalid base64 format:', e.message);
            }
        } else {
            console.log('❌ No audio data returned');
        }
        
    } catch (error) {
        console.error('❌ Error testing ElevenLabs TTS:', error.message);
        console.error('🔍 Error details:', error);
    }
}


if (!elevenLabsService.isConfigured()) {
    console.log('⚠️  ElevenLabs API key not found. Please check your .env file for ELEVENLABS_API_KEY');
    process.exit(1);
}

// Run the test
testElevenLabsTTS()
    .then(() => {
        console.log('🏁 Test completed');
        process.exit(0);
    })
    .catch((error) => {
        console.error('💥 Test failed:', error.message);
        process.exit(1);
    });