'use client'

// The standard popup header bar, matching the New Client modal: a light-teal
// band with the title in the same Ethnocentric face as the sidebar brand, and a
// close button. Use this on every modal so they all read the same.
export default function ModalHeader({ title, subtitle, onClose, radius = 16 }: {
  title: string
  subtitle?: string
  onClose: () => void
  radius?: number
}) {
  return (
    <div style={{
      padding: '10px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      background: '#7EC8D0', borderBottom: '1px solid #CBD5E1',
      borderRadius: `${radius}px ${radius}px 0 0`, flexShrink: 0,
    }}>
      <div style={{ minWidth: 0 }}>
        <h2 style={{ margin: 0, fontFamily: "'Ethnocentric Rg', sans-serif", fontSize: 14, fontWeight: 300, color: '#132E57', letterSpacing: '0.04em' }}>
          {title}
        </h2>
        {subtitle && (
          <p style={{ margin: '2px 0 0', fontSize: 13, color: '#132E57', fontFamily: "'Aptos', sans-serif", fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {subtitle}
          </p>
        )}
      </div>
      <button onClick={onClose} aria-label="Close"
        style={{ border: 0, background: 'rgba(19,46,87,0.12)', cursor: 'pointer', borderRadius: 8, width: 28, height: 28, fontSize: 18, lineHeight: 1, color: '#132E57', flexShrink: 0 }}>
        ×
      </button>
    </div>
  )
}
