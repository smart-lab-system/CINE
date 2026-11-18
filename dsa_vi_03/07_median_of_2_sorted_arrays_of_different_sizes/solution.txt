

// User function Template for Java

class Solution {
    public double medianOf2(int a[], int b[]) {
        // Your Code Here
        
        int []arr=new int[a.length+b.length];
        int k=0;
        for(int i=0;i<a.length;i++){
            arr[k]=a[i];
            k++;
        }
          for(int j=0;j<b.length;j++){
            arr[k]=b[j];
            k++;
        }
          Arrays.sort(arr);
        int mid=arr.length/2;
        int n=arr.length;
        
        if(n%2==0){
            double median=(arr[mid]+arr[mid-1])/2.0;
            return median;
        }
        double median=arr[mid];
        return median;
    }
}