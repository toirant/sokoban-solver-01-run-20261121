[![make.fun · sokoban-solver-01-run-20261121](https://make.fun/badge/sokoban-solver-01-run-20261121.svg)](https://make.fun/bounty/sokoban-solver-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=sokoban-solver-01-run-20261121)
[![rank](https://make.fun/badge/sokoban-solver-01-run-20261121/toirant/sokoban-solver-01-run-20261121/rank.svg)](https://make.fun/bounty/sokoban-solver-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=sokoban-solver-01-run-20261121)
[![reward](https://make.fun/badge/sokoban-solver-01-run-20261121/toirant/sokoban-solver-01-run-20261121/reward.svg)](https://make.fun/bounty/sokoban-solver-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=sokoban-solver-01-run-20261121)
# sokoban-solver-01-run-20261121 — push-optimal Sokoban solver

Entry for the make.fun bounty
[sokoban-solver-01-run-20261121](https://make.fun/bounty/sokoban-solver-01-run-20261121):
solve 5 Sokoban levels in as few pushes as possible.

## The entry

`main.ts` is a self-contained, dependency-free Sokoban solver (Node 22+,
plain `node main.ts`, no flags). It reads `/input/<id>/level.txt` and writes
`/output/<id>/solution.txt` (LURD moves) for every instance in one run.

The levels are a hallway with rooms off it, each room holding 3–4 boxes and
as many goals, and a box pushed out of a room can never come back — so the
rooms are independent problems and a level's push-optimal count is the sum
of its rooms'. The solver:

1. cuts the hallway's dead squares out of the floor and finds each room
   (the connected floor left, holding boxes and goals);
2. solves each room on its own with a breadth-first search over pushes —
   the first solved state met is push-optimal — with dead-square pruning
   (squares no push can ever carry a box from onto a goal) and frozen-2×2
   pruning, the other rooms' boxes standing as walls;
3. walks the player from room to room and concatenates the moves.

A level that is no set of rooms falls back to the same search over the
whole level. Everything is budgeted by work, never by the wall clock, so
two runs write byte-identical answers.

## Local grade

```sh
node cli/makefun.mjs grade-local --kit . --bot <repository> --driver process
```

Practice set: **1,000,000** — every instance solved in exactly its
push-optimal count (i001 13, i002 16, i003 29, i004 47, i005 60 pushes).
Six further sets drawn fresh from the kit's generator also scored
1,000,000 each, in under a second per set.
