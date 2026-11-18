



// User function Template for Java

class Solution {
    public int maxWeightCell(int[] exits) {
        int[] arr = new int[exits.length];
        for(int i =0 ; i<exits.length ;i++){
            if(exits[i]==-1) continue;
            arr[exits[i]] = arr[exits[i]] + i; 
        }
        int max = 0 ; 
        int idx = 0;;
        for(int i = arr.length - 1 ; i>=0 ; i--){
            if(arr[i]>max){
                max=arr[i];
                idx=i;
            }
        }
        return idx;
    }
}