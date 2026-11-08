/** Versioned rules contracts. CCA2020 is the requested target, NOT a claim of complete compliance. */
import {PublicProfileAdjudicator} from './public-profile-adjudicator.js';
import { Adjudicator, classifyCheckCycle } from './adjudication.js';
const verifiedAt='2026-10-20';
const definitions={
 'pikafish-public-b562': {
  id:'pikafish-public-b562',version:'b562d6aeac5401879e973dc53ddb56053f07bb6a',name:'Pinned public Pikafish root rule_judge(0)',jurisdiction:'computer-reference',
  verifiedAt:'2026-10-31',latestVerifiedEdition:false,status:'pinned-public-reference',
  source:'https://github.com/official-pikafish/Pikafish/blob/b562d6aeac5401879e973dc53ddb56053f07bb6a/src/position.cpp',
  movement:'implemented-differentially-tested',terminalNoMoves:'implemented-loss',repetition:'public-check-and-chase',noCapture:'public-adjusted-rule60',materialDraws:'public-material-classes',
  earlyDrawRestriction:'not-part-of-profile',
  note:'External rule_judge(0) profile, not native UCI root-search behavior or complete CCA2020; complete supplied history required, unknown earlier problem history not certified.'
 },
 cca2020: {
  id:'cca2020',version:'2020',name:'中国象棋协会《象棋竞赛规则（2020版）》',jurisdiction:'mainland-China',
  verifiedAt,latestVerifiedEdition:true,status:'partial-conservative',
  source:'https://www.sport.gov.cn/qpzx/n5387/c30016667/content.html',
  sourcePublishedAt:'2026-09-09',editionEffectiveDate:null,
  movement:'implemented-differentially-tested',terminalNoMoves:'implemented-loss',
  repetition:'unresolved-pending-cycle-claims-threats-chases-and-variation-procedure',
  noCapture:'unresolved-pending-claimant-specific-check-exemptions',
  materialDraws:'unresolved',earlyDrawRestriction:'unresolved-article-4.3',
  note:'Latest edition supported by current official national event evidence; original effective day unverified. Engine is not a full CCA2020 referee.'
 },
 pikafish2026: {
  id:'pikafish2026',version:'2026-09-06',name:'Pikafish 2026-09-06 computer rules (partial)',jurisdiction:'computer-reference',
  verifiedAt,latestVerifiedEdition:false,status:'partial-computer-reference',
  source:'https://github.com/official-pikafish/Pikafish/blob/Pikafish-2026-09-06/src/position.cpp',
  movement:'implemented-differentially-tested',terminalNoMoves:'implemented-loss',
  repetition:'check-cycles-only',noCapture:'unresolved',materialDraws:'unresolved',
  earlyDrawRestriction:'not-part-of-profile',
  note:'Not equivalent to mainland CCA2020, WXF or Asian federation rules.'
 }
};
for(const profile of Object.values(definitions))Object.freeze(profile);
export const RULE_PROFILES=Object.freeze(definitions);
export const DEFAULT_RULE_PROFILE='cca2020';
export function getRuleProfile(id=DEFAULT_RULE_PROFILE){
 if(typeof id!=='string'||!Object.hasOwn(RULE_PROFILES,id))throw new Error(`Unknown rules profile ${String(id)}; choose cca2020, pikafish2026 or pikafish-public-b562`);
 return RULE_PROFILES[id];
}
export function classifyRepetitionForProfile(entries,profile=DEFAULT_RULE_PROFILE){
 const rules=getRuleProfile(profile);
 if(rules.id==='pikafish-public-b562')throw Error('Public repetition adjudication requires legal board/move history, not check flags alone');
 if(rules.id==='pikafish2026')return {...classifyCheckCycle(entries),ruleProfile:rules.id,ruleStatus:rules.status};
 return {terminal:false,winner:null,reason:'unresolved-cca2020-repetition',unresolved:true,claimRequired:true,arbiterRequired:true,obligations:[],obligationState:'not-determined',procedureStatus:'claim-and-variation-state-machine-not-implemented',ruleProfile:rules.id,ruleStatus:rules.status};
}
export class ProfileAdjudicator extends Adjudicator {
 constructor(board,{profile=DEFAULT_RULE_PROFILE,historyComplete}={}){
  if(profile==='pikafish-public-b562')throw Error('Public profile requires createProfileAdjudicator');
  super(board,{historyComplete});this.ruleProfile=getRuleProfile(profile);
 }
 push(board,moverSide){
  const result=super.push(board,moverSide);
  // Ordinary no-legal-move results have shared semantics. A computer repetition
  // result is never allowed to become an authoritative mainland-rules result.
  const repeated=result.cycleStart!==undefined;
  if(this.ruleProfile.id==='cca2020'&&repeated){
   this.result={...classifyRepetitionForProfile([],this.ruleProfile.id),cycleStart:result.cycleStart,cycleEnd:result.cycleEnd,cyclePlies:result.cyclePlies};
  }else this.result={...result,ruleProfile:this.ruleProfile.id,ruleStatus:this.ruleProfile.status};
  return this.result;
 }
}
export function createProfileAdjudicator(board,options={}){
 const profile=getRuleProfile(options.profile);
 return profile.id==='pikafish-public-b562'?new PublicProfileAdjudicator(board,{...options,ruleProfile:profile}):new ProfileAdjudicator(board,options);
}
