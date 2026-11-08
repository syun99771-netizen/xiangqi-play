/** Search-local typed move storage. Encoded moves fit signed 16 bits (0..8099).
 * Growth never truncates, including synthetic nonstandard material inventories.
 */
export class MoveBuffer {
 constructor(capacity=128){if(!Number.isInteger(capacity)||capacity<1)throw Error('Invalid move buffer capacity');this.data=new Int16Array(capacity);this.length=0;}
 reset(){this.length=0;}
 push(move){if(this.length===this.data.length){const next=new Int16Array(this.data.length*2);next.set(this.data);this.data=next;}this.data[this.length++]=move;}
 candidate(squares,side,capturesOnly,from,to){const p=squares[to];if(p*side<=0&&Math.abs(p)!==7&&(!capturesOnly||p))this.push(from*90+to);}
 view(){return this.data.subarray(0,this.length);}
}
