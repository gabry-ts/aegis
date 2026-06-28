// The rule library drawer: the full catalogue of rule definitions, split into
// the ones placed on this endpoint's board and the ones kept in the library
// only. Rules can be added to or removed from the board here without ever
// deleting their definition.

import { useState } from 'react'
import { ACTION_COLOR } from './rulesYaml'
import type { Rule } from '../../types'

export default function RuleLibrary({
  rules,
  board,
  armed,
  selectedId,
  onSelect,
  onAddToBoard,
  onRemoveFromBoard,
  onClose,
}: {
  rules: Rule[]
  /** Board membership; null means the whole library is on the board. */
  board: Set<string> | null
  armed: Set<string>
  selectedId: string | null
  onSelect: (id: string) => void
  onAddToBoard: (id: string) => void
  onRemoveFromBoard: (id: string) => void
  onClose: () => void
}) {
  const [q, setQ] = useState('')

  // Armed rules are always on the board, even if a stale board list omits them.
  const onBoard = (id: string) => board === null || board.has(id) || armed.has(id)

  const query = q.trim().toLowerCase()
  const match = (r: Rule) =>
    !query ||
    r.name.toLowerCase().includes(query) ||
    String(r.verdict).toLowerCase().includes(query)

  const visible = rules.filter(match)
  const onBoardRules = visible.filter((r) => onBoard(r.id))
  const libraryOnly = visible.filter((r) => !onBoard(r.id))

  const row = (r: Rule, inBoard: boolean) => {
    const color = ACTION_COLOR[r.action] || 'muted'
    const isArmed = armed.has(r.id)
    return (
      <li
        key={r.id}
        className={
          'rlib-row' +
          (selectedId === r.id ? ' is-sel' : '') +
          (inBoard && !isArmed ? ' is-off' : '')
        }
      >
        <button type="button" className="rlib-row__main" onClick={() => onSelect(r.id)}>
          <span className="rlib-row__top">
            <span className="rlib-name">{r.name}</span>
            {inBoard && isArmed && <span className="rlib-dot" title="armed" />}
          </span>
          <span className="rlib-row__meta mono">
            <span className={'rf-tag rf-tag--' + color}>{r.action}</span>
            {String(r.verdict).replace(/_/g, ' ')} · {r.detector}
          </span>
        </button>
        {inBoard ? (
          <button
            type="button"
            className="rlib-act rlib-act--remove"
            onClick={() => onRemoveFromBoard(r.id)}
            title="Remove from board (stays in the library)"
            aria-label={`Remove ${r.name} from board`}
          >
            −
          </button>
        ) : (
          <button
            type="button"
            className="rlib-act rlib-act--add"
            onClick={() => onAddToBoard(r.id)}
            title="Add to board"
            aria-label={`Add ${r.name} to board`}
          >
            +
          </button>
        )}
      </li>
    )
  }

  return (
    <aside className="rlib">
      <header className="rlib__head">
        <span className="rlib__title mono">LIBRARY · {rules.length}</span>
        <button type="button" className="rlib__close" onClick={onClose} aria-label="Close library">
          ✕
        </button>
      </header>

      <input
        type="text"
        className="rlib__search mono"
        placeholder="Search rules…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      <div className="rlib__body">
        <div className="rlib__group mono">ON BOARD · {onBoardRules.length}</div>
        {onBoardRules.length ? (
          <ul className="rlib__list">{onBoardRules.map((r) => row(r, true))}</ul>
        ) : (
          <p className="rlib__empty mono">no rules on this board</p>
        )}

        <div className="rlib__group mono">IN LIBRARY ONLY · {libraryOnly.length}</div>
        {libraryOnly.length ? (
          <ul className="rlib__list">{libraryOnly.map((r) => row(r, false))}</ul>
        ) : (
          <p className="rlib__empty mono">every rule is on the board</p>
        )}
      </div>
    </aside>
  )
}
