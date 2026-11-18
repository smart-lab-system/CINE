
/*You are required to complete the function*/
class Solution {
    public int findMaxProduct(int[] arr, int k) {
        // code here
        Arrays.sort(arr)
        int max = arr.length-1,prod=1;
    for(int i=k;i>0;i--){
        prod *= arr[max--];
    }
    return prod;
    }
}