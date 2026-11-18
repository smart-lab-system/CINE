
/*You are required to complete the function*/
class Solution {
    public int findMaxProduct(int[] arr, int k) {
        // code here
        int max =0;
        for(int i=0;i<arr.length;i++){
            int j=i, multi=1,c=0;
            while(j<arr.length&&c<k){
                multi*=arr[j++];
                c++;
            }
            if(c==k){
                max = Math.max(max,multi);
            }
        }
        return max;
    }
}