import { ImageResponse } from 'next/og';

// Route segment config
export const runtime = 'edge';

// Image metadata
export const alt = 'API to MOJ Converter';
export const size = {
  width: 1200,
  height: 630,
};

export const contentType = 'image/png';

// Image generation
export default async function Image() {
  
  return new ImageResponse(
    (
      // ImageResponse JSX element
      <div
        style={{
          background: '#09090b', // zinc-950
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'sans-serif',
          position: 'relative',
        }}
      >
        {/* Abstract Background Gradients */}
        <div
            style={{
                position: 'absolute',
                top: '-20%',
                left: '-10%',
                width: '600px',
                height: '600px',
                background: 'linear-gradient(to right, #6366f1, #d946ef)', // indigo to fuchsia
                opacity: 0.2,
                filter: 'blur(100px)',
                borderRadius: '50%',
            }}
        />
         <div
            style={{
                position: 'absolute',
                bottom: '-20%',
                right: '-10%',
                width: '600px',
                height: '600px',
                background: 'linear-gradient(to right, #8b5cf6, #ec4899)', // violet to pink
                opacity: 0.2,
                filter: 'blur(100px)',
                borderRadius: '50%',
            }}
        />

        {/* Content Container */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 10 }}>
            {/* Logo */}
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '80px',
                    height: '80px',
                    background: 'linear-gradient(to bottom right, #6366f1, #8b5cf6)',
                    borderRadius: '20px',
                    marginBottom: '30px',
                    boxShadow: '0 10px 30px rgba(99, 102, 241, 0.4)',
                }}
            >
                 <svg
                    width="48"
                    height="48"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="white"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ color: 'white' }}
                >
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" fill="white" stroke="none" />
                </svg>
            </div>

            {/* Title */}
            <h1
                style={{
                    fontSize: 80,
                    fontWeight: 800,
                    margin: 0,
                    textAlign: 'center',
                    backgroundImage: 'linear-gradient(to right, #fff, #a1a1aa)',
                    backgroundClip: 'text',
                    color: 'transparent',
                    lineHeight: 1.1,
                    letterSpacing: '-0.02em',
                }}
            >
                API to MOJ
            </h1>

            {/* Subtitle */}
             <div
                style={{
                    fontSize: 32,
                    fontWeight: 500,
                    margin: '20px 0 0 0',
                    color: '#a1a1aa',
                    textAlign: 'center',
                    maxWidth: '800px',
                }}
            >
                Machine-Optimized JSON for AI Agents
            </div>
            
            {/* Tagline pill */}
             <div
                style={{
                    marginTop: '40px',
                    padding: '10px 24px',
                    background: 'rgba(255, 255, 255, 0.1)',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    borderRadius: '100px',
                    fontSize: 20,
                    color: '#e4e4e7',
                }}
            >
                Swagger / OpenAPI conversion made simple
            </div>
        </div>
      </div>
    ),
    // ImageResponse options
    {
      ...size,
    }
  );
}
