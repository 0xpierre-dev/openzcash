"use client";
import { memo, useId, type CSSProperties } from "react";
import { getImageProps } from "next/image";
import type { ZarvisExpression } from "@/lib/zarvis/types";
import { FIGURE_VIEW_BOX, GROUND, POSE_CELL, poses, selectedPose, type Pose } from "./zarvis-poses";

const SHEET = POSE_CELL * 2;
const sheets = new Map([...new Set(Object.values(poses).map((pose) => pose.sheet))].map((sheet) =>
  [sheet, getImageProps({ src: `/zarvis/${sheet}`, alt: "", width: POSE_CELL, height: POSE_CELL }).props.src]));
const viewBox = `${FIGURE_VIEW_BOX.x} ${FIGURE_VIEW_BOX.y} ${FIGURE_VIEW_BOX.width} ${FIGURE_VIEW_BOX.height}`;
const entries = Object.entries(poses) as [string, Pose][];
/** Poses blink out of step. Every phase stays before the first blink of the cycle (18% of 13.7 s), so a pose that is shown paused never freezes with its eyes shut. */
const BLINK_STAGGER = .29;
/** The still body layer reaches this far under the moving head, along the neck line and around a held object, so a nod or a glance uncovers artwork instead of the page behind. A nod plus the widest glance moves the head about 7 units. */
const UNDERLAY = 8;
const underlay = { stroke: "white", strokeWidth: UNDERLAY * 2, strokeLinejoin: "round" } as const;

/** Stable layers preserve motion and blend poses without remounting the character. Every pose is moved onto the same feet position, so a pose change never slides. */
export const ZarvisFigure = memo(function ZarvisFigure({ className = "", expression = "idle", animated = true, paused = false, settled = false, entrance }: {
  className?: string; expression?: ZarvisExpression; animated?: boolean; paused?: boolean; settled?: boolean;
  /** Welcome only: "landing" drops the character in, "raising" plays the one emphasis on the shield. */
  entrance?: "landing" | "raising";
}) {
  const id = useId().replaceAll(":", "");
  return <svg className={`zarvis-mark zarvis-figure ${className}`} viewBox={viewBox}
    data-expression={expression} data-animated={animated} data-paused={paused} data-settled={settled} data-entrance={entrance} aria-hidden="true" focusable="false">
    <defs>{entries.map(([name, pose]) => {
      const prefix = `zarvis-${id}-${name}`;
      return <g key={name}>
        <pattern id={`${prefix}-art`} width={SHEET} height={SHEET} patternUnits="userSpaceOnUse"><image href={sheets.get(pose.sheet)} x={-pose.x} y={-pose.y} width={SHEET} height={SHEET}/></pattern>
        <mask id={`${prefix}-body`} maskUnits="userSpaceOnUse" x="0" y="0" width={POSE_CELL} height={POSE_CELL}>
          <rect y={pose.rows.top} width={POSE_CELL} height={pose.rows.bottom - pose.rows.top + 1} fill="white"/><path d={pose.head} fill="black"/>
          <path d={pose.head} fill="none" {...underlay}/>
          {pose.foreground ? <path d={pose.foreground} fill="white" {...underlay}/> : null}
          {pose.arm ? <path d={pose.arm} fill="black"/> : null}
        </mask>
        <mask id={`${prefix}-head`} maskUnits="userSpaceOnUse" x="0" y="0" width={POSE_CELL} height={POSE_CELL}>
          <rect width={POSE_CELL} height={POSE_CELL} fill="black"/><path d={pose.head} fill="white"/>
          {pose.foreground ? <path d={pose.foreground} fill="black"/> : null}
          {pose.arm ? <path d={pose.arm} fill="black"/> : null}
        </mask>
        {pose.emblem ? <clipPath id={`${prefix}-emblem`}><path d={pose.emblem}/></clipPath> : null}
      </g>;
    })}
      <linearGradient id={`zarvis-${id}-gleam`} x1="0" x2="1" y1="0" y2="0">
        <stop offset="0" stopColor="#fff6d6" stopOpacity="0"/><stop offset=".5" stopColor="#fff6d6" stopOpacity=".62"/><stop offset="1" stopColor="#fff6d6" stopOpacity="0"/>
      </linearGradient>
    </defs>
    <ellipse className="zarvis-ground" cx={GROUND.cx} cy={GROUND.cy} rx={GROUND.rx} ry={GROUND.ry}/>
    <g className="zarvis-entrance">
      <g className="zarvis-character zarvis-rig">
        {entries.map(([name, pose], index) => {
          const prefix = `zarvis-${id}-${name}`;
          const fill = `url(#${prefix}-art)`;
          return <g key={name} className="zarvis-pose" data-pose={name} data-visible={selectedPose[expression] === name}
            transform={`translate(${pose.offset.dx} ${pose.offset.dy})`} style={{ "--zarvis-blink-phase": `${(-index * BLINK_STAGGER).toFixed(2)}s` } as CSSProperties}>
            <rect width={POSE_CELL} height={POSE_CELL} fill={fill} mask={`url(#${prefix}-body)`}/>
            <g className="zarvis-rig-head">
              <g className="zarvis-rig-gaze">
                <rect width={POSE_CELL} height={POSE_CELL} fill={fill} mask={`url(#${prefix}-head)`}/>
                {pose.eyes.map(([cx, cy, rx, ry], eye) => <g key={eye}>
                  <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="#080906"/>
                  <g className={`zarvis-eye zarvis-eye-${eye}`}><ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={fill}/></g>
                </g>)}
              </g>
            </g>
            {pose.arm ? <g className="zarvis-rig-arm" style={{ transformOrigin: pose.pivot }}><path d={pose.arm} fill={fill}/></g> : null}
            {/* The held object again, over the body, so its one pulse never uncovers a hole. Hidden unless it is playing. */}
            {pose.emblem ? <g className="zarvis-emblem" style={{ transformOrigin: pose.emblemPivot }}>
              <path d={pose.emblem} fill={fill}/>
              <g clipPath={`url(#${prefix}-emblem)`}><rect className="zarvis-emblem-gleam" x="384" y="296" width="80" height="228" fill={`url(#zarvis-${id}-gleam)`}/></g>
            </g> : null}
          </g>;
        })}
      </g>
    </g>
  </svg>;
});
