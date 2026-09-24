export function clamp01(value){
  const n=Number(value);
  return Number.isFinite(n)?Math.max(0,Math.min(1,n)):0;
}

const STOP_WORDS=new Set([
  'va','la','cua','cho','de','duoc','voi','trong','mot','nhung','cac','co','can','ghi','ro','noi','dung','hoc'
]);

export function normalizeLearningText(value=''){
  return String(value)
    .toLowerCase()
    .replace(/đ/g,'d')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9]+/g,' ')
    .trim()
    .replace(/\s+/g,' ');
}

function tokenSet(value=''){
  return new Set(
    normalizeLearningText(value)
      .split(' ')
      .filter(token=>token.length>=2&&!STOP_WORDS.has(token))
  );
}

function diceSimilarity(a,b){
  if(!a.size||!b.size)return 0;
  let overlap=0;
  for(const token of a)if(b.has(token))overlap++;
  return (2*overlap)/(a.size+b.size);
}

function feedbackKey(row){
  return [
    normalizeLearningText(row?.content||''),
    normalizeLearningText(row?.note||''),
    normalizeLearningText(row?.teacher_comment||'')
  ].join('|');
}

function disagreementWeight(type){
  if(type==='teacher_revision_after_ai_approve')return 0.10;
  if(type==='teacher_approve_after_ai_revision')return 0.09;
  if(type==='teacher_approve_after_ai_manual')return 0.08;
  if(type==='legacy_revision_after_ai_approve')return 0.05;
  return 0;
}

export function selectFeedbackExamples(rows,current,maxExamples=25){
  const limit=Math.max(0,Math.min(25,Number(maxExamples)||25));
  if(!limit)return [];

  const sorted=[...(rows||[])].sort((a,b)=>{
    const ta=Date.parse(a?.created_at||'')||0;
    const tb=Date.parse(b?.created_at||'')||0;
    return tb-ta;
  });

  const unique=[];
  const seen=new Set();
  for(const row of sorted){
    const key=feedbackKey(row);
    if(!key||seen.has(key))continue;
    seen.add(key);
    unique.push(row);
  }

  const selected=[];
  const selectedKeys=new Set();
  const add=row=>{
    const key=feedbackKey(row);
    if(!key||selectedKeys.has(key)||selected.length>=limit)return;
    selectedKeys.add(key);
    selected.push(row);
  };

  const recentCount=Math.min(10,limit,unique.length);
  unique.slice(0,recentCount).forEach(add);

  const currentText=[current?.content,current?.note,current?.teacherComment].filter(Boolean).join(' ');
  const currentTokens=tokenSet(currentText);

  const scored=unique
    .filter(row=>!selectedKeys.has(feedbackKey(row)))
    .map((row,index)=>{
      const rowStudentText=[row?.content,row?.note].filter(Boolean).join(' ');
      const rowAllText=[rowStudentText,row?.teacher_comment].filter(Boolean).join(' ');
      // Teacher comments add useful context but must not dilute similarity
      // when the student's original content is an exact/near-exact match.
      const similarity=Math.max(
        diceSimilarity(currentTokens,tokenSet(rowStudentText)),
        diceSimilarity(currentTokens,tokenSet(rowAllText))
      );
      const recencyBonus=Math.max(0,0.04-(index*0.0005));
      return {
        row,
        score:similarity+disagreementWeight(row?.feedback_type)+recencyBonus
      };
    })
    .sort((a,b)=>b.score-a.score || ((Date.parse(b.row?.created_at||'')||0)-(Date.parse(a.row?.created_at||'')||0)));

  for(const item of scored){
    if(selected.length>=limit)break;
    add(item.row);
  }

  return selected;
}

export function resolveReviewOutcome(input){
  const categoryAllowsAuto=['study','device_for_learning'].includes(String(input?.category||''));
  const modelDecision=String(input?.modelDecision||'manual_review');
  const reviewConfidence=clamp01(input?.reviewConfidence);
  const baseThreshold=clamp01(input?.baseThreshold ?? 0.90);
  const revisionThreshold=clamp01(input?.revisionThreshold ?? 0.85);

  if(!input?.hasTeacherGuidance){
    return {
      finalDecision:
        modelDecision==='auto_approve'&&categoryAllowsAuto&&reviewConfidence>=baseThreshold
          ?'auto_approve'
          :'manual_review'
    };
  }

  const revisionStatus=String(input?.revisionStatus||'uncertain');
  const revisionConfidence=clamp01(input?.revisionConfidence);

  if(revisionStatus==='not_satisfied'){
    return {
      finalDecision:revisionConfidence>=revisionThreshold?'request_revision':'manual_review'
    };
  }

  if(revisionStatus!=='satisfied'||revisionConfidence<revisionThreshold){
    return {finalDecision:'manual_review'};
  }

  return {
    finalDecision:
      modelDecision==='auto_approve'&&categoryAllowsAuto&&reviewConfidence>=revisionThreshold
        ?'auto_approve'
        :'manual_review'
  };
}

export function resolveDeviceDetection(input={}){
  const priorSource=String(input.priorSource||'none');
  const studentDeclared=
    input.studentFlag===true && (priorSource==='none'||priorSource==='student'||priorSource==='');

  if(studentDeclared){
    return {
      usesElectronicDevice:true,
      source:'student',
      confidence:1
    };
  }

  if(input.aiDetected===true){
    return {
      usesElectronicDevice:true,
      source:'ai',
      confidence:clamp01(input.aiConfidence)
    };
  }

  return {
    usesElectronicDevice:false,
    source:'none',
    confidence:null
  };
}

