

// User function Template for Java

class Solution {
    public int maxWeightCell(int[] exits) {
        if(exits.length==1) return 0; 
        int maxW=Integer.MIN_VALUE;
        int maxIndex=-1;
        
        for(int i=0;i<exits.length;i++){
            if(exits[i]>maxW) //|| exits[i]==maxW && i>maxIndex){
                maxW=exits[i];
                maxIndex=i;
            }
        }
        return maxIndex;
    }
}