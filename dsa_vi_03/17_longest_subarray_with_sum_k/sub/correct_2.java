

// User function Template for Java

class Solution {
    public int longestSubarray(int[] arr, int k) {
        // code here
      HashMap<Integer,Integer> preSum = new HashMap<>();
      int maxLength = 0;
      int sum = 0;
      int n = arr.length; 
      for(int i = 0; i<n; i++){
         sum += arr[i];
         if(sum == k){
             maxLength = Math.max(maxLength, i+1);
         }
         int rem = sum - k;
         if(preSum.containsKey(rem)){
             int len = i-preSum.get(rem);
             maxLength = Math.max(len,maxLength);
             
         }
         if(!preSum.containsKey(sum)){
             preSum.put(sum, i);
         }
         
      }
      return maxLength;
    }
}