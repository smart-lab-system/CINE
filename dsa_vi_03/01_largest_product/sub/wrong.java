/*You are required to complete the function*/
class Solution {
    public int findMaxProduct(int[] arr, int k) {
        // code here
        int n = arr.length,pro=1;
        for(int i=n/k;i<n;i++){
            pro *= arr[i];
        }
        return pro;
    }
}