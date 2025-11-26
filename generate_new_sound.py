#!/usr/bin/env python3
"""
Generate multiple short, low-frequency beep sound options to replace begin-record.wav
All options are under 250ms duration for you to choose from
"""
import numpy as np
from scipy.io import wavfile
import os

def generate_short_low_beep(filename, duration=0.2, frequency=400, sample_rate=44100, amplitude=0.3):
    """
    Generate a short beep with lower frequency
    
    Args:
        filename: Output filename
        duration: Duration in seconds 
        frequency: Frequency in Hz
        sample_rate: Audio sample rate
        amplitude: Volume level (0.0 to 1.0)
    """
    # Generate time array
    t = np.linspace(0, duration, int(sample_rate * duration), False)
    
    # Generate sine wave with specified frequency
    wave = amplitude * np.sin(2 * np.pi * frequency * t)
    
    # Apply a simple envelope to avoid clicking (fade in/out)
    fade_samples = int(0.01 * sample_rate)  # 10ms fade
    if len(wave) > 2 * fade_samples:
        # Fade in
        wave[:fade_samples] *= np.linspace(0, 1, fade_samples)
        # Fade out  
        wave[-fade_samples:] *= np.linspace(1, 0, fade_samples)
    
    # Convert to 16-bit integer format
    audio_data = (wave * 32767).astype(np.int16)
    
    # Write WAV file
    wavfile.write(filename, sample_rate, audio_data)
    print(f"Generated {filename}: {int(duration*1000)}ms duration, {frequency}Hz frequency")

if __name__ == "__main__":
    # Change to the assets directory
    assets_dir = "src/renderer/src/assets"
    os.makedirs(assets_dir, exist_ok=True)
    
    # Begin-record sound options (all under 250ms for quick response)
    begin_sound_options = [
        # Short & Low frequency options
        {"duration": 0.1, "frequency": 250, "name": "begin_very_short_low.wav"},
        {"duration": 0.15, "frequency": 250, "name": "begin_short_low.wav"},
        {"duration": 0.2, "frequency": 250, "name": "begin_medium_low.wav"},
        
        # Medium length with different frequencies  
        {"duration": 0.1, "frequency": 350, "name": "begin_very_short_medium.wav"},
        {"duration": 0.15, "frequency": 350, "name": "begin_short_medium.wav"},
        {"duration": 0.2, "frequency": 350, "name": "begin_medium_medium.wav"},
        {"duration": 0.24, "frequency": 350, "name": "begin_long_medium.wav"},
        
        # Slightly higher frequency options
        {"duration": 0.1, "frequency": 450, "name": "begin_very_short_high.wav"},
        {"duration": 0.15, "frequency": 450, "name": "begin_short_high.wav"},
        {"duration": 0.2, "frequency": 450, "name": "begin_medium_high.wav"},
        
        # A few longer but still under 250ms
        {"duration": 0.22, "frequency": 300, "name": "begin_longer_low.wav"},
        {"duration": 0.24, "frequency": 400, "name": "begin_longer_med.wav"},
    ]
    
    # End-record sound options (can be longer, focused on lower frequencies)
    end_sound_options = [
        # Low frequency options (good for ending sound)
        {"duration": 0.3, "frequency": 200, "name": "end_low_200hz.wav"},
        {"duration": 0.4, "frequency": 200, "name": "end_low_200hz_long.wav"},
        {"duration": 0.3, "frequency": 180, "name": "end_low_180hz.wav"},
        {"duration": 0.5, "frequency": 180, "name": "end_low_180hz_long.wav"},
        {"duration": 0.3, "frequency": 150, "name": "end_very_low_150hz.wav"},
        {"duration": 0.6, "frequency": 150, "name": "end_very_low_150hz_long.wav"},
        
        # Medium-low frequency options
        {"duration": 0.3, "frequency": 250, "name": "end_medlow_250hz.wav"},
        {"duration": 0.4, "frequency": 250, "name": "end_medlow_250hz_long.wav"},
        {"duration": 0.3, "frequency": 220, "name": "end_medlow_220hz.wav"},
        {"duration": 0.5, "frequency": 220, "name": "end_medlow_220hz_long.wav"},
        
        # Even deeper options for comparison
        {"duration": 0.4, "frequency": 120, "name": "end_deep_120hz.wav"},
        {"duration": 0.6, "frequency": 120, "name": "end_deep_120hz_long.wav"},
        {"duration": 0.4, "frequency": 100, "name": "end_deep_100hz.wav"},
        {"duration": 0.8, "frequency": 100, "name": "end_deep_100hz_long.wav"},
    ]
    
    print("Generating begin-record sound options (all under 250ms):")
    print("=" * 60)
    
    for option in begin_sound_options:
        filename = os.path.join(assets_dir, option["name"])
        generate_short_low_beep(
            filename, 
            duration=option["duration"], 
            frequency=option["frequency"]
        )
    
    print("\nGenerating end-record sound options (lower frequencies, can be longer):")
    print("=" * 60)
    
    for option in end_sound_options:
        filename = os.path.join(assets_dir, option["name"])
        generate_short_low_beep(
            filename, 
            duration=option["duration"], 
            frequency=option["frequency"]
        )
    
    print("=" * 60)
    print("All sound files created successfully!")
    print("\nBEGIN-RECORD options (quick response needed):")
    print("- Very short: 100ms, Short: 150ms, Medium: 200ms, Long: 240ms")
    print("- Frequencies: 250Hz (deep), 350Hz (warm), 450Hz (clear)")
    print("\nEND-RECORD options (can be longer, lower frequencies):")
    print("- Short: 300ms, Medium: 400-500ms, Long: 600-800ms")
    print("- Frequencies: 100-200Hz (very deep), 220-250Hz (deep)")
    print("\nTo use different sounds:")
    print("1. Rename your preferred begin sound to 'begin-record.wav'")
    print("2. Rename your preferred end sound to 'end-record.wav'")
    print("3. Or update recorder.ts code to use specific filenames")