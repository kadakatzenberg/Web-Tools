/**
 * A combatant's portrait, with the rank mark standing in whenever there isn't
 * one to show.
 *
 * The fallback matters more than the image. A portrait is decoration on an
 * operational tool: the library may be unreachable, the row may have no
 * picture, the storage object may 404, or the character may not be in the
 * library at all. In every one of those cases the emblem has to keep doing its
 * job — carrying rank — rather than collapsing into a browser's broken-image
 * glyph. So a failed load is caught and the mark is drawn instead.
 *
 * The image is decorative in the accessibility tree. The combatant's name is
 * already adjacent in every place this is used, and a second announcement of it
 * would just be noise to a screen reader.
 */

import { memo, useEffect, useState } from "react";
import type { Combatant } from "@/domain/types";
import { rankMark } from "./icons";
import "./portrait.css";

export const Portrait = memo(function Portrait({
  c,
  size = 30,
  className = "",
}: {
  c: Pick<Combatant, "role" | "type" | "hp" | "portrait">;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const down = c.hp <= 0;
  const Mark = rankMark(c.role, c.type, down);

  const rank = down
    ? "down"
    : c.role === "Player"
      ? "player"
      : c.type === "Boss"
        ? "boss"
        : c.type === "Elite"
          ? "elite"
          : "normal";

  // A new URL deserves a fresh attempt — otherwise correcting a broken link on
  // the card would leave the fallback showing until the next full remount.
  useEffect(() => setFailed(false), [c.portrait]);

  const show = c.portrait && !failed;

  return (
    <span
      className={`portrait ${show ? "portrait--image" : ""} ${className}`}
      data-rank={rank}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {show ? (
        <img
          className="portrait__img"
          src={c.portrait}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => setFailed(true)}
        />
      ) : (
        <Mark size={Math.round(size * 0.56)} />
      )}
    </span>
  );
});
