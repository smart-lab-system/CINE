
class Solution {
    public int findUnique(int k, int[] arr) {
        // code here
        int INT_SIZE = 32;
        int result = 0;
        
        for(int i=0;i< INT_SIZE;i++){
            int sum =0;
            
            for(int num:arr){
                if((num>>i&1)==1){
                    sum++;
                }
            }
            if(sum %k!=0){
                result |=(1<<i);
            }
        }
    }
}
}