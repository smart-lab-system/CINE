

class Solution {
    int maxSubarraySum(int[] a) {
        // Your code here
        int sum=0;
        int maxi=0;
        for(int i=0;i<a.length;i++){
            sum+=a[i];
            maxi=Math.max(maxi,sum);
            if(sum<0){
                sum=0;
            }
        }
        return maxi;
    }
}