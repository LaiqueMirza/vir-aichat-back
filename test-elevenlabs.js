require('dotenv').config();
const elevenLabsService = require('./src/services/elevenLabsService');

async function testElevenLabsTTS() {
    try {
        console.log('🚀 Starting ElevenLabs TTS test...');
        console.log('📝 Text to convert:', "Based on the documents provided as context");
        
        // Test the textToSpeechStream method
        const audioData = await elevenLabsService.textToSpeechStream(
            "Based on the documents provided as context"
        );
        
        if (audioData) {
            console.log('✅ TTS Success!');
            console.log('📊 Audio data:', audioData);
            console.log('📏 Audio data length:', audioData.length);
            console.log('🎵 First 100 characters of base64:', audioData.substring(0, 100));
            console.log('💾 Audio size estimate:', Math.round(audioData.length / 1024), 'KB');
            
            // Verify it's valid base64
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

// Check if ElevenLabs is configured
console.log('🔧 Checking ElevenLabs configuration...');
console.log('✓ API Key configured:', elevenLabsService.isConfigured() ? 'Yes' : 'No');

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