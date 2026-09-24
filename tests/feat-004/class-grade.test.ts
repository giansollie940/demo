import {it,expect}from 'vitest';
import{requireClassGrade,rejectGradeEdit}from '../../supabase/functions/_shared/class-grade';
it('Edge grade validator rejects missing, coerced, fractional and out-of-canonical input',()=>{
 for(const v of[undefined,null,'7','',true,5,13,7.5,NaN,Infinity,{},[]])expect(()=>requireClassGrade(v)).toThrow('Chọn khối');
 for(const v of[6,7,8,9,10,11,12])expect(requireClassGrade(v)).toBe(v);
});
it('ordinary Edge edit rejects any supplied grade while code/name do not derive it',()=>{
 expect(()=>rejectGradeEdit({code:'7A9',name:'Grade12'})).not.toThrow();
 for(const grade of[7,8,null,'7',undefined])expect(()=>rejectGradeEdit({grade})).toThrow('task riêng');
 expect(requireClassGrade(8)).toBe(8);
});
