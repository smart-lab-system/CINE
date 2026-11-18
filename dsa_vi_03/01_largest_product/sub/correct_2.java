
/*You are required to complete the function*/
class Solution {
    public static int findMaxProduct(int[] arr, int k) {
         // code here
         int n=arr.length;
         int windowProduct=1;
         for (int i=0;i<k;i++)
         {
          windowProduct*=arr[i];
         }
         if(k==n) return windowProduct;
         
         int maxProduct=windowProduct;
         for (int i=k;i<n;i++)
         {
 
             windowProduct*=arr[i];
             windowProduct/=arr[i-k];
 
             maxProduct=Math.max(maxProduct,windowProduct);
         }
         return maxProduct;
     }
 }
 