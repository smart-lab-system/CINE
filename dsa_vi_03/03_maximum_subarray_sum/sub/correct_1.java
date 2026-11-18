

class Solution {
    int maxSubarraySum(int[] arr) {
        int curr=0,max=Integer.MIN_VALUE;
        for(int i=0;i<arr.length;i++)
        {
            curr+=arr[i];
            max=Math.max(curr,max);
            if(curr<0)
            curr=0;
        }
        return max;
    }
}