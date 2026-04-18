import { useEffect, useState } from 'react'

function SearchInput({
  value,
  onValueChange,
  onDebouncedChange,
  placeholder = 'Buscar...',
  delay = 220,
  ariaLabel,
  className = '',
  inputRef,
  onKeyDown,
  onFocus,
  onBlur,
}) {
  const isControlled = value !== undefined
  const [internalValue, setInternalValue] = useState(String(value ?? ''))
  const resolvedValue = isControlled ? String(value ?? '') : internalValue

  useEffect(() => {
    if (typeof onDebouncedChange !== 'function') return undefined

    const timeoutId = window.setTimeout(() => {
      onDebouncedChange(resolvedValue)
    }, Math.max(Number(delay) || 0, 0))

    return () => window.clearTimeout(timeoutId)
  }, [delay, onDebouncedChange, resolvedValue])

  const handleChange = (event) => {
    const nextValue = String(event.target.value ?? '')
    if (!isControlled) {
      setInternalValue(nextValue)
    }
    onValueChange?.(nextValue)
  }

  return (
    <div className={`search-input-control ${className}`.trim()}>
      <input
        ref={inputRef}
        type="text"
        value={resolvedValue}
        onChange={handleChange}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        onBlur={onBlur}
        placeholder={placeholder}
        aria-label={ariaLabel || placeholder}
      />
      {resolvedValue && (
        <button
          type="button"
          className="quick-fill-btn"
          onClick={() => {
            if (!isControlled) {
              setInternalValue('')
            }
            onValueChange?.('')
            onDebouncedChange?.('')
          }}
          aria-label="Limpiar búsqueda"
        >
          Limpiar
        </button>
      )}
    </div>
  )
}

export default SearchInput