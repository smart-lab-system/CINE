/*You are required to complete the function*/
class Solution {
    public int findMaxProduct(int[] arr, int k) {
        int maxproduct = 0, product = 1, n = arr.length;
        for(int i=0; i<= n-k; i++){
            int j = 0;
            while(j<k){   
            product *= arr[i+j];
            }
            maxproduct = Math.max(product, maxproduct);
        }
        return maxproduct;
    }
}