

// User function Template for Java

class Solution {
    public double medianOf2(int a[], int b[]) {
        // Your Code Here
        int i =0, j=0, idx=0;
        int n1 = a.length;
        int n2 = b.length;
        int[] arr = new int[n1+n2];
        while(i<n1 && j<n2){
            if(a[i] < b[j]){
                arr[idx++] = a[i++];
            }else{
                arr[idx++] = b[j++];
            }
        }
        
        while(i<n1){
            arr[idx++] = a[i++];
        }
        
        while(j<n2){
            arr[idx++] = b[j++];
        }
        
        int n = arr.length;
        double median = 0;
        int mid = n/2;
        if(n%2 == 0){
            median = (arr[mid-1] + arr[mid])/2.0;
        }else{
            median  = (double)arr[mid];
        }
        return median;
    }
}