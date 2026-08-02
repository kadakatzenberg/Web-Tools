/**
 * Reactions waiting on the moment that just happened.
 *
 * Reactions were modelled as cooldowns, which says when one is *available* and
 * nothing about when it goes off — and every reaction in the pool is defined by
 * its trigger, not its timer. This strip closes that: after a hit or a knockout
 * it names every armed reaction whose trigger the event satisfies, and offers
 * to spend it.
 *
 * Derived, never stored. The list is recomputed from the encounter and the last
 * event, so it cannot go stale, cannot survive an undo, and cannot be left
 * pointing at a combatant who has since been removed.
 *
 * It is a strip rather than a toast because a toast that vanishes after eight
 * seconds is exactly the kind of thing this tool exists to stop people missing.
 */

import { useMemo } from "react";
import type { CombatEvent } from "@/domain/rules";
import { armedReactions } from "@/domain/rules";
import { useStore, useStoreApi } from "@/state/store";
import { Button, IconButton } from "../primitives";
import { IconClose } from "../icons";
import "./reaction.css";

export function ReactionPrompt({
  event,
  onDismiss,
}: {
  event: CombatEvent | null;
  onDismiss: () => void;
}) {
  const { present } = useStore();
  const { dispatch } = useStoreApi();

  const armed = useMemo(
    () =>
      event
        ? armedReactions(
            present.combatants,
            event,
            present.playerPhaseCount,
            present.enemyPhaseCount,
          )
        : [],
    [event, present.combatants, present.playerPhaseCount, present.enemyPhaseCount],
  );

  if (!event || armed.length === 0) return null;

  const subject = present.combatants.find((c) => c.id === event.targetId);

  return (
    <aside className="reaction" role="status" aria-label="Reactions armed">
      <div className="reaction__head">
        <span className="reaction__eyebrow">
          {armed.length === 1 ? "A reaction is armed" : `${armed.length} reactions are armed`}
        </span>
        {subject && (
          <span className="reaction__cause">
            {event.kind === "down" ? `${subject.name} went down` : `${subject.name} was hit`}
          </span>
        )}
        <IconButton label="Dismiss reactions" onClick={onDismiss}>
          <IconClose size={12} />
        </IconButton>
      </div>

      <ul className="reaction__list">
        {armed.map(({ combatant, ability }) => (
          <li key={`${combatant.id}:${ability.id}`} className="reaction__item">
            <span className="reaction__who">{combatant.name}</span>
            <span className="reaction__what">{ability.name}</span>
            <Button
              size="sm"
              tone="danger"
              onClick={() =>
                dispatch({
                  type: "ABILITY_USED",
                  id: combatant.id,
                  abilityId: ability.id,
                  // Reaction spends max+1 so it misses the current round's tick,
                  // matching how the React button on the card already works.
                  patch: { cur: ability.max + 1 },
                  marksDone: false,
                })
              }
            >
              Fire
            </Button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
