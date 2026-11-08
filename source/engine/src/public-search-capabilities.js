// SPDX-License-Identifier: GPL-3.0-or-later
export const PUBLIC_SEARCH_CAPABILITIES=Object.freeze({
 id:'public-b562-coherent-subnodes-v1',source:'b562d6aeac5401879e973dc53ddb56053f07bb6a',
 originSearchSha256:'f4bb13fe0405b4bed0c6a26a142511e4e85a6d51c64a171fccbf69672e741fc9',
 repetition:'Exact third-occurrence public check/chase; no native speculative twofold claim',
 priority:'Exact repetition, adjusted rule60, DIRECT_DRAW, conditional MATE_DRAW, generic no-legal loss',
 history:'Complete validated chronological replay from declared origin; earlier play/check counters not inferred',
 null:'Public terminal adjudication suppressed in null subtrees',
 root:'SDK root rule_judge(0) adapter; low-level Search/player requires caller root admission',
 clock:'Search.run budget includes its history validation; SDK input replay/root adjudication outside that budget',
 certification:'Pinned public subset/priority, not full CCA or identical native UCI search',
 browser:'ES modules intended portable; actual browser/Worker execution remains unverified'
});

// Apply only at the coherent public entry; historical v1 receives unchanged context.
export function withPublicSearchCapabilities(context){
 const previous='Root adjudication includes adjusted rule60/material; search descendants currently use repetition and no-legal rules, not full public rule60/material.';
 return {...context,searchCapabilities:PUBLIC_SEARCH_CAPABILITIES,limitations:context.limitations.map(x=>x===previous?'Search descendants use the separately qualified coherent public repetition/clock/material/no-legal priority; no speculative native twofold or complete CCA claim.':x)};
}
