
// User function Template for Java

class Solution {
    public double medianOf2(int a[], int b[]) {
        // Your Code Here
        int[] arr=new int[a.length+b.length];
        System.arraycopy(a,0,arr,0,a.length);
        System.arraycopy(b,0,arr,a.length,b.length);
        Arrays.sort(arr);
        int len=arr.length;
        double median=0;
        int mid=len/2;
        if(len%2==1)
        {
            median=arr[mid];
        }
        if(len%2==0)
        {
            median=(arr[mid-1]+arr[mid])/2;
        }
        String str=String.format("%.5f",median);
        
     return Double.valueOf(median);
    }
}