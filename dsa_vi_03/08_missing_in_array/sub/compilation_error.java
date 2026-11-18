

// User function Template for Java
class Solution {
    public static   int missingNumber(int nums[]) {
           
          int n =nums.length+1;
     int sum=(n*(n+1)/2);
   
         
           for(int i = 0;i<nums-1.length;i++){
               
              sum= sum-nums[i];
           }
           return sum;
       }
   }