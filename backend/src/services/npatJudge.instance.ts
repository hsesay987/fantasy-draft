import "../shared/topicDraft/npat/lists"; // the answer lists the judge checks against
import { lookup } from "../shared/topicDraft/npat/source";
import { anthropicVerdictLlm, createNpatJudge, prismaVerdictCache } from "./npatJudge.service";

/** The server's one judge (model + stored verdicts), shared by the NPAT routes and the daily's re-score. */
export const judge = createNpatJudge({
  llm: anthropicVerdictLlm(),
  cache: prismaVerdictCache(),
  onList: (category, text) => !!lookup(category, text),
});

/** For a server re-score of a finished game: a stored AI verdict, never a model call. */
export const cachedVerdict = judge.cachedVerdict;
