

class Solution {
    int maxSubarraySum(int[] arr) {
        int sum =arr[0], max =arr[0];
       for(int i=1;i<arr.length;i++){
           sum = Math.max(arr[i]+sum, arr[i]);
           
           max = Math.max(sum, max);
       }
        return max;
    }
}