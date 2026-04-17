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
  const [internalValue, setInternalValue] = useState(String(value ?? ''))

  useEffect(() => {
    setInternalValue(String(value ?? ''))
  }, [value])

  useEffect(() => {
    if (typeof onDebouncedChange !== 'function') return undefined

    const timeoutId = window.setTimeout(() => {
      onDebouncedChange(internalValue)
    }, Math.max(Number(delay) || 0, 0))

    return () => window.clearTimeout(timeoutId)
  }, [delay, internalValue, onDebouncedChange])

  const handleChange = (event) => {
    const nextValue = String(event.target.value ?? '')
    setInternalValue(nextValue)
    onValueChange?.(nextValue)
  }

  return (
    <div className={`search-input-control ${className}`.trim()}>
      <input
        ref={inputRef}
        type="text"
        value={internalValue}
        onChange={handleChange}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        onBlur={onBlur}
        placeholder={placeholder}
        aria-label={ariaLabel || placeholder}
      />
      {internalValue && (
        <button
          type="button"
          className="quick-fill-btn"
          onClick={() => {
            setInternalValue('')
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