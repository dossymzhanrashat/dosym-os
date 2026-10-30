import { useId } from 'react';

/*
 * The droplet mascot, drawn from brand/droplet.svg (glossy iridescent drop with two dark eyes).
 * Inline SVG so the eyes can change with the mood. Use for the loading/empty-state character and
 * celebrations (streak milestones, submitted application, successful experiment).
 */

export type MascotMood = 'idle' | 'happy' | 'sleepy';

const DROP =
  'M104.6 234.0 C100.6 234.4 99.0 234.1 96.3 234.0 C93.6 233.9 92.0 233.9 88.4 233.1 C84.8 232.3 78.7 230.7 74.7 229.3 C70.7 227.8 67.9 226.4 64.5 224.2 C61.0 222.0 57.2 219.1 53.9 216.1 C50.7 213.1 47.4 209.1 45.1 206.1 C42.7 203.2 41.5 201.0 40.0 198.4 C38.4 195.8 37.4 194.3 35.9 190.5 C34.4 186.7 32.1 180.5 30.8 175.4 C29.5 170.3 28.6 165.2 28.2 159.9 C27.8 154.6 27.8 148.9 28.2 143.6 C28.6 138.2 29.5 133.3 30.8 127.7 C32.1 122.2 33.8 116.2 35.9 110.2 C38.1 104.1 40.8 97.8 43.7 91.5 C46.6 85.2 50.0 78.6 53.3 72.4 C56.7 66.1 59.6 61.1 63.9 54.3 C68.2 47.4 73.4 39.4 79.2 31.4 C85.0 23.4 95.4 10.2 98.8 6.0 C102.2 1.8 99.3 5.8 99.5 6.0 C99.7 6.2 99.8 5.3 100.1 7.3 C100.4 9.3 100.5 13.8 101.3 18.0 C102.1 22.3 103.1 27.0 105.0 33.0 C106.9 39.0 110.0 47.6 112.7 54.1 C115.5 60.6 118.4 66.2 121.5 72.0 C124.6 77.8 127.6 83.0 131.4 88.9 C135.1 94.7 139.9 101.6 144.0 107.2 C148.1 112.7 152.8 117.8 156.0 122.1 C159.2 126.4 161.2 129.9 163.0 133.2 C164.9 136.5 166.0 139.3 167.1 142.0 C168.1 144.7 168.7 145.5 169.5 149.4 C170.3 153.3 171.6 160.2 171.8 165.4 C172.0 170.5 171.3 176.3 170.8 180.3 C170.2 184.3 169.6 185.8 168.3 189.3 C167.0 192.7 165.0 197.4 163.0 200.9 C161.1 204.3 158.8 207.3 156.5 210.0 C154.2 212.7 151.5 215.2 149.4 217.1 C147.3 219.0 146.9 219.5 143.9 221.3 C141.0 223.2 135.8 226.3 131.8 228.0 C127.8 229.8 124.6 230.9 120.0 231.9 C115.5 232.9 108.5 233.6 104.6 234.0 Z';

function Eyes({ mood }: { mood: MascotMood }) {
  if (mood === 'idle') {
    return (
      <g>
        <ellipse cx="84" cy="160" rx="12.5" ry="16" fill="#07070b" stroke="#ffffff" strokeOpacity="0.45" strokeWidth="2" />
        <ellipse cx="122" cy="156" rx="12.5" ry="16" fill="#07070b" stroke="#ffffff" strokeOpacity="0.45" strokeWidth="2" />
        <circle cx="88" cy="154" r="3.6" fill="#ffffff" opacity="0.9" />
        <circle cx="126" cy="150" r="3.6" fill="#ffffff" opacity="0.9" />
      </g>
    );
  }
  // happy: eyes squeezed into upward arcs; sleepy: lids closed into downward arcs
  const d =
    mood === 'happy'
      ? ['M72 165 Q84 147 96 165', 'M110 161 Q122 143 134 161']
      : ['M72 158 Q84 169 96 158', 'M110 154 Q122 165 134 154'];
  return (
    <g fill="none" stroke="#07070b" strokeWidth="6" strokeLinecap="round">
      <path d={d[0]} />
      <path d={d[1]} />
    </g>
  );
}

interface MascotProps {
  mood?: MascotMood;
  /** Width in px; height follows (5:6). */
  size?: number;
  /** A small bounce for celebrations (switched off by prefers-reduced-motion). */
  bounce?: boolean;
  /** Accessible name; leave empty when the mascot is decoration next to text. */
  label?: string;
  className?: string;
}

export function Mascot({ mood = 'idle', size = 96, bounce = false, label, className = '' }: MascotProps) {
  // Unique ids per instance so several mascots on one page don't share gradients/clips
  const id = `m${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const url = (name: string) => `url(#${id}-${name})`;
  return (
    <span className={`mascot ${bounce ? 'mascot--bounce' : ''} ${className}`} style={{ width: size }}>
      <svg viewBox="0 -4 200 262" role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
        <defs>
          <radialGradient
            id={`${id}-sh`}
            gradientUnits="userSpaceOnUse"
            cx="92"
            cy="145"
            r="100"
            fx="76"
            fy="128"
            gradientTransform="translate(92 145) scale(1 1.4) translate(-92 -145)"
          >
            <stop offset="0" stopColor="#140a50" stopOpacity="0" />
            <stop offset="0.6" stopColor="#140a50" stopOpacity="0" />
            <stop offset="1" stopColor="#140a50" stopOpacity="0.6" />
          </radialGradient>
          <filter id={`${id}-s`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="5" />
          </filter>
          <filter id={`${id}-g`} x="-50%" y="-200%" width="200%" height="500%">
            <feGaussianBlur stdDeviation="7" />
          </filter>
          <filter id={`${id}-b1`} x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="17" />
          </filter>
          <filter id={`${id}-b2`} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="4" />
          </filter>
          <clipPath id={`${id}-clip`}>
            <path d={DROP} />
          </clipPath>
        </defs>
        <ellipse cx="100" cy="246" rx="56" ry="7" fill="#5a4bff" opacity="0.55" filter={url('g')} />
        <g clipPath={url('clip')}>
          <rect x="0" y="0" width="200" height="240" fill="#e4ecff" />
          <circle cx="38" cy="200" r="72" fill="#b14bff" filter={url('b1')} />
          <ellipse cx="118" cy="186" rx="62" ry="42" fill="#4a52ff" filter={url('b1')} />
          <circle cx="184" cy="132" r="48" fill="#78ecff" filter={url('b1')} />
          <ellipse cx="112" cy="70" rx="56" ry="50" fill="#ffffff" filter={url('b1')} />
          <ellipse cx="24" cy="160" rx="18" ry="42" fill="#ff8ef0" opacity="0.55" filter={url('b1')} />
          <path d={DROP} fill="none" stroke="#ffffff" strokeOpacity="0.75" strokeWidth="6" filter={url('b2')} />
          <rect x="0" y="0" width="200" height="240" fill={url('sh')} />
          <ellipse cx="122" cy="216" rx="40" ry="11" fill="#c4f8ff" opacity="0.6" filter={url('s')} />
          <ellipse cx="60" cy="122" rx="10" ry="24" transform="rotate(22 60 122)" fill="#ffffff" opacity="0.85" filter={url('s')} />
          <circle cx="70" cy="96" r="4.5" fill="#ffffff" opacity="0.9" filter={url('s')} />
        </g>
        <Eyes mood={mood} />
      </svg>
    </span>
  );
}
