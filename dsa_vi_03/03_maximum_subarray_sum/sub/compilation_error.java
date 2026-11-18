

class Solution {
    int maxSubarraySum(int[] arr) {
        // Your code here
        int sum=arr;
        int maxsum=arr[0];
        for(int i=0;i<arr.length;i++){
            sum+=arr[i];
            
            maxsum=Math.max(sum,maxsum);
            if(sum<0) sum=0;
        }
        return maxsum;
    }
}