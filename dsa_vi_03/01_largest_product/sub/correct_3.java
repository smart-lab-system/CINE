/*You are required to complete the function*/
class Solution {
    public int findMaxProduct(int[] arr, int k) {
        // code here
        int n = arr.length;
        int i = 0; int j = 0;
        int mx = 0;
        int product = 1;
        
        while(j < n){
            product *= arr[j];
            
            if((j - i + 1) < k){
                j++;
            }
            
            else{
                mx = Math.max(mx, product);
                product /= arr[i];
                
                i++;
                j++;
                
            }
            
        }
        return mx;
    }
}